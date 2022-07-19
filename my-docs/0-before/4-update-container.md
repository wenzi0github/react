# # React18源码解析之 updateContainer 方法

> 我们解析的源码是React18.0.2版本，请注意版本号。GitHub仓库地址：[https://github.com/wenzi0github/react](https://github.com/wenzi0github/react)。

updateContainer()方法是在入口方法render()中调用的。所有的功能也是在这里完成的，如将element结构的树转为fiber结构再渲染到dom中，挂载事件，挂载hooks等。

```javascript
ReactDOMRoot.prototype.render = function(
  children: ReactNodeList,
): void {
  const root = this._internalRoot; // FiberRootNode
  updateContainer(children, root, null, null);
};
```

由此可知updateContainer一共接收了4个参数，后两个参数为null：

* 第1个参数是通过createElement()构建出来的element结构，即<App />；
* 第2个参数是整个应用的根节点，即FiberRootNode节点；

如果忘记了，我们再来复习下element的结构：

```javascript
const element = {
  $$typeof: Symbol(react.element),
  key: null,
  props: {
    children: { // 当children有多个时，会转为数组类型
      $$typeof: Symbol(react.element),
      key: null,
      props: {
        children: "hello world", // 文本节点没有类型
      },
      ref: null,
      type: "span",
    },
  },
  ref: null,
  type: "div",
}
```
