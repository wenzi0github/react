# React 中常见的 api 方法

https://react.docschina.org/docs/react-api.html

如：

- React.Component: 类组件的基类
- React.PureComponent: 以浅层对比 prop 和 state 的方式来实现了该函数；
- React.memo: 缓存函数组件，若 props 相同是，则渲染相同的结果，用于缓存组件渲染结果，来提高组件的性能；
- createElement: jsx 内部的市县方式，也可以直接用来创建元素；
- cloneElement: 克隆一个 React 元素，并可以赋予新的 props；
- isValidElement: 判断是否为 React 元素；
- Children: 这里面提供了一些工具方法，用来操作类型为数组的 children；主要用于 children 不明确的情况里，比如万一 children 可能是 null；
  - React.Children.map(children, callback): 循环，并返回处理后的元素；
