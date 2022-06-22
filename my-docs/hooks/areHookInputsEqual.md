# areHookInputsEqual 的源码

areHookInputsEqual()是用来比较hook的依赖项是否产生了变化，若任意一项变了，则返回false，hook会重新执行；若所有的依赖项都一样，则返回true，则hook还使用之前缓存的结果。

我们先来看下去掉调试代码之后的代码，结构比较简单，容易理解。

```javascript
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
      continue;
    }
    return false;
  }
  return true;
}
```
