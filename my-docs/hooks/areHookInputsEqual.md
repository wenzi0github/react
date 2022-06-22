# areHookInputsEqual 的源码

areHookInputsEqual()是用来比较hook的依赖项是否产生了变化，若任意一项变了，则返回false，hook会重新执行；若所有的依赖项都一样，则返回true，则hook还使用之前缓存的结果。

我们先来看下去掉调试代码之后的代码，结构比较简单，容易理解。

```javascript

```
