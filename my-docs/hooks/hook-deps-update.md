# hook的依赖项更新机制

如useEffect, useMemo, useCallback等hook，第2个参数是依赖项，那么这些hook是如何根据依赖项进行更新的呢。

这3个hook，几乎都有两个判断的逻辑：

1. 判断nextDeps是否为null，若为null直接跳过，执行下面的更新逻辑；
2. 若nextDeps不为null，则与之前的prevDeps里的每项比较是否产生了变化，若没有变化则返回之前的结果（useEffect情况复杂一些）；

```javascript
const nextDeps = deps === undefined ? null : deps;
if (nextDeps !== null) {
  // 
  if (areHookInputsEqual(nextDeps, prevDeps)) {
    // 若依赖项没有变化，则返回之前得到的结果
    return prevState[0];
  }
}

// update
```

由此可见，若没有设置依赖项，或设置的依赖项为null，则该hook每次渲染时都会执行；若依赖项任何一项都没有变化，使用上一次渲染的结果。

`areHookInputsEqual()`是如何进行对比的？

areHookInputsEqual()是用来比较hook的依赖项是否产生了变化，若任意一项变了，则返回false，hook会重新执行；若所有的依赖项都一样，则返回true，则hook还使用之前缓存的结果。

我们先来看下去掉调试代码之后的代码，结构比较简单，容易理解。

源码地址： [ReactFiberHooks.old.js#L326](https://github.com/wenzi0github/react/blob/af08b92c5ed382d09f269226479862ae828e26dc/packages/react-reconciler/src/ReactFiberHooks.old.js#L326)

```javascript
/**
 * 比较两个依赖项中的每一项是否有变化
 * 即使有一项产生了变化，则返回false，
 * 若全部都一样，没有变化，则返回true
 * @param nextDeps
 * @param prevDeps
 * @returns {boolean}
 */
function areHookInputsEqual(
  nextDeps: Array<mixed>,
  prevDeps: Array<mixed> | null,
) {
  // 删除测试环境下的警告代码
  // 若prevDeps为null，或prevDeps.length与nextDeps.length不相等时，会提出警告
  
  /**
   * 比较prevDeps和nextDeps的每一项，
   * 这里的is是Object.is的代称，并进行的polyfill
   */
  for (let i = 0; i < prevDeps.length && i < nextDeps.length; i++) {
    if (is(nextDeps[i], prevDeps[i])) {
      // 若两个元素相同，则继续比较
      continue;
    }
    // 若相同位置的两个不一样，则返回false，
    // 说明依赖项产生了变化
    return false;
  }
  return true;
}
```

我们来看`Object.is()`是如何进行对比的，与`==`和`===`有什么不同之处。

源码地址：[objectIs.js](https://github.com/wenzi0github/react/blob/main/packages/shared/objectIs.js)

Object.is的官方地址： [Object.is](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/is)

* Object.is() 与 == 不同。`==`无法区分falsly值（假值），即如空字符串、false，数字0，undefined, null 等，均会判定为true，而Object.is则不会强制转换两边的值。
* Object.is() 与 === 也不相同。差别是它们对待有符号的零和 NaN 不同，例如，=== 运算符（也包括 == 运算符）将数字 -0 和 +0 视为相等，而将 Number.NaN 与 NaN 视为不相等。

我们再看下调试代码里说了什么：

```javascript
function areHookInputsEqual(
  nextDeps: Array<mixed>,
  prevDeps: Array<mixed> | null,
) {
  if (__DEV__) {
    if (ignorePreviousDependencies) {
      // Only true when this component is being hot reloaded.
      // 在 renderWithHooks() 中：
      // Used for hot reloading:
      // ignorePreviousDependencies = current !== null && current.type !== workInProgress.type;
      // 若current的fiber节点与workInProgress的fiber节点不一样，则将ignorePreviousDependencies设置为true
      // 表示需要忽略之前的依赖项
      // 然后这里直接返回false，表示前后的依赖项不相同
      return false;
    }
  }

  // 能执行到这里，说明nextDeps不为空（若为空时就已经直接执行了）
  // 但若prevDeps为空，则给出警告，
  // 当前hook 在此渲染期间收到了最后一个参数，但在前一次渲染期间没有收到。 即使最后一个参数是可选的，它的类型也不能在渲染之间改变。
  if (prevDeps === null) {
    if (__DEV__) {
      console.error(
        '%s received a final argument during this render, but not during ' +
        'the previous render. Even though the final argument is optional, ' +
        'its type cannot change between renders.',
        currentHookNameInDev,
      );
    }
    return false;
  }

  if (__DEV__) {
    // Don't bother comparing lengths in prod because these arrays should be
    // passed inline.
    // 若nextDeps和prevDeps都不为空，但两者的数组长度不一样，则给出警告
    if (nextDeps.length !== prevDeps.length) {
      console.error(
        'The final argument passed to %s changed size between renders. The ' +
        'order and size of this array must remain constant.\n\n' +
        'Previous: %s\n' +
        'Incoming: %s',
        currentHookNameInDev,
        `[${prevDeps.join(', ')}]`,
        `[${nextDeps.join(', ')}]`,
      );
    }
  }
  // 上面的校验都通过后，则开始比较每一项是否发生了变化
  // for-Object.is
}
```

