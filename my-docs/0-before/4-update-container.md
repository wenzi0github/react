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

由此可知 updateContainer 一共接收了4个参数，后两个参数为null：

* 第1个参数是通过 createElement() 构建出来的element结构，即<App />；
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

scheduleUpdateOnFiber() 函数调用的链路很深，我们通过这个[render()流程图](https://docs.qq.com/flowchart/DS0pVdnB0bmlVRkly?u=7314a95fb28d4269b44c0026faa673b7)，也可以看到，通过后续各种方法的调用，将上面的element结构转成了fiber结构。而且，useState()更新时，链路流程差不多，只不过细节上有些差异，如初始化时不用收集副作用，更新的类型全部为插入操作，不用进行两个fiber树的diff对比等。

从 scheduleUpdateOnFiber() 函数的名字中就可以看出，这是对每个fiber节点赋予不同的优先级
