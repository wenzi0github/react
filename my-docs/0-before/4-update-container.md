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

updateContainer() 方法的作用就是将传进来的element转为fiber结构，然后更新到container中。

我们把代码精简一下：

```javascript
/**
 * 更新element树，将其更新到container上
 * @param {ReactNodeList} element 虚拟DOM树
 * @param {OpaqueRoot} container FiberRootNode 节点
 * @param {?React$Component<any, any>} parentComponent 在React18传到这里的是null
 * @param {?Function} callback render()里的callback，不过从React18开始就没了，传入的是null
 * @returns {Lane}
 */
export function updateContainer(
  element: ReactNodeList,
  container: OpaqueRoot,
  parentComponent: ?React$Component<any, any>,
  callback: ?Function,
): Lane {
  // FiberRootNode.current 现在指向到当前的fiber树，
  // 若是初次执行时，current树只有hostFiber节点，没有其他的
  const current = container.current;

  /**
   * 这两个语句会创建一个update结构：
   * const update: Update<*> = {
        eventTime,
        lane,
        tag: UpdateState,
        payload: {element},
        callback: null,
        next: null,
      };
   */
  const update = createUpdate(eventTime, lane);
  update.payload = {element};

  /**
   * 将update添加到current的更新链表中
   * 将上面的update节点插入这个shareQueue的循环链表中，pending指针指向到最后插入的那个节点上
   * 执行后，得到的是 current.updateQueue.shared.pending = sharedQueue
   */
  enqueueUpdate(current, update, lane);

  /**
   * 这里传入的current是HostRootFiber的fiber节点了，虽然他的下面没有其他fiber子节点，
   * 但它的updateQueue上有element结构，可以用来构建fiber节点
   */
  const root = scheduleUpdateOnFiber(current, lane, eventTime);
}
```

scheduleUpdateOnFiber() 函数比较复杂，这里单拿出进行讲解。

