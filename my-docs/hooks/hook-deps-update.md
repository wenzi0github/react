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

`areHookInputsEqual()`是如何进行对比的，可以参考另一篇文档 [areHookInputsEqual 的源码](./are-hook-inputs-equal.md) ;

但useEffect情况比较复杂一些，稍后再单独细看。
