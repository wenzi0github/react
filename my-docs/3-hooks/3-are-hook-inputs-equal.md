# React18 源码解析之 hook 的依赖项更新机制

> 我们解析的源码是 React18.1.0 版本，请注意版本号。React 源码学习的 GitHub 仓库地址：[https://github.com/wenzi0github/react](https://github.com/wenzi0github/react)。

我们在之前讲解 useCallback()和 useMemo()中，稍微说了下 `areHookInputsEqual()` 的功能。这篇文章我们来详细讲解下。

在如 useEffect(), useMemo(), useCallback() 等 hooks 中，第 2 个参数是依赖项，那么这些 hooks 是如何根据依赖项进行更新的呢。

## 1. 使用场景

这几个 hooks 在 update 更新阶段里，几乎都有两个判断的逻辑：

1. 判断新的依赖项 nextDeps 是否为 null，若为 null 直接跳过，执行后续的更新逻辑；
2. 若新的依赖项 nextDeps 不为 null，则与之前的依赖项 prevDeps 里的每项比较，看是否产生了变化，若依赖项没有变化，则使用缓存的数据，若任意一项产生了变化，则执行后续的更新逻辑；

如下面的这段代码：

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

由此可见，若没有设置依赖项，或设置的依赖项为 null，则该 hook 每次渲染时都会执行；若依赖项任何一项都没有变化，使用上一次渲染的结果。

那么 areHookInputsEqual() 是如何进行对比的？

## 2. 源码

我们来看下去掉调试代码之后的代码，结构比较简单，容易理解。

源码地址： [ReactFiberHooks.old.js#L326](https://github.com/wenzi0github/react/blob/af08b92c5ed382d09f269226479862ae828e26dc/packages/react-reconciler/src/ReactFiberHooks.old.js#L326)

```javascript
/**
 * 比较两个依赖项中的每一项是否有变化
 * 任意一项产生了变化，则返回 alse，表示两个依赖项不相等
 * 若全部都一样，没有变化，则返回 true
 * @param nextDeps 新的依赖项
 * @param prevDeps 之前旧的依赖项
 * @returns {boolean}
 */
function areHookInputsEqual(nextDeps: Array<mixed>, prevDeps: Array<mixed> | null) {
  // 删除测试环境下的警告代码
  // 若 prevDeps 为n ull，或 prevDeps.length 与 nextDeps.length不 相等时，会产生警告

  /**
   * 比较 prevDeps 和 nextDeps 的每一项，
   * 这里的 is 是 Object.is 的代称，并进行的 polyfill
   */
  for (let i = 0; i < prevDeps.length && i < nextDeps.length; i++) {
    if (is(nextDeps[i], prevDeps[i])) {
      // 若两个元素相同，则继续比较
      continue;
    }
    // 若相同位置的两个数据不一样，说明依赖项产生了变化，直接返回false
    return false;
  }

  // 所有的依赖项都相等，返回true
  return true;
}
```

这里为什么用 Object.is()来进行对比，而不是双等号或者三等号呢？我们来看`Object.is()`与`==`和`===`有什么不同之处。

React 源码中 Object.is 地址：[objectIs.js](https://github.com/wenzi0github/react/blob/main/packages/shared/objectIs.js)

Object.is 的官方 MDN 地址： [Object.is](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/is)

- Object.is() 与 == 不同。`==`无法区分 falsly 值（假值），即如空字符串、false，数字 0，undefined, null 等，均会判定为 true，而 Object.is 则不会强制转换两边的值。
- Object.is() 与 === 也不相同。差别是它们对待有符号的零和 NaN 不同，例如，=== 运算符（也包括 == 运算符）将数字 -0 和 +0 视为相等，而将 Number.NaN 与 NaN 视为不相等。

areHookInputsEqual() 是用来比较 hook 的依赖项是否产生了变化，若任意一项变了，则返回 false，hook 会重新执行；若所有的依赖项都一样，则返回 true，则 hook 还使用之前缓存的数据。

为了使比较的结果更加准确，这里选择了使用`Object.is()`。

我们再看下调试代码里说了什么：

```javascript
function areHookInputsEqual(nextDeps: Array<mixed>, prevDeps: Array<mixed> | null) {
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

## 3. 总结

所有有依赖项的 hooks，在对比前后依赖项是否发生变动时，都是用 areHookInputsEqual() 来进行对比的。

有很多同学会把 json 结构或者 object 类型的变量放到依赖项中，这就会存在一个问题，每次在进行依赖项对比时，两个 object 类型的变量都是不相等的，不管他们之间的 key 或者 value 是否发生变化，每次都会执行 hook 中的回调函数。因此，为了避免这种情况，我们不建议直接把 object 类型的变量放到依赖项中。若是依赖 key 都是已知的，这里建议是把每个 key 都拆分出来，分别放到依赖项中；若 key 是不明确的，或者动态变化的，可以先对 key 进行字典排序，然后再进行依赖项设置。
