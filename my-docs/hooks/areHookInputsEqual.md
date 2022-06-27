# areHookInputsEqual 的源码

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


