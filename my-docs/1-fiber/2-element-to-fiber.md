# React18 源码解析之虚拟 DOM 转为 fiber 树

> 我们解析的源码是 React18.1.0 版本，请注意版本号。React 源码学习的 GitHub 仓库地址：[https://github.com/wenzi0github/react](https://github.com/wenzi0github/react)。

我们在文章 [React18 源码解析之 fiber 等数据结构](https://www.xiabingbao.com/post/react/jsx-element-fiber-rfztfs.html) 中讲解了 jsx, element 和 fiber 的基本结构。这里我们主要讲下如何将 jsx 转为 fiber 节点组成的 fiber 树。

我们为便于理解整个转换的过程，会做一些流程上的精简：

1. 大部分只考虑初始渲染阶段，因此诸如副作用的收集等暂时就不考虑了，不过偶尔也会涉及到一点两棵 fiber 树的对比；
2. 忽略各种任务的优先级的调度；
3. React 中各个节点的类型很多，如函数组件、类组件、html 节点、Suspense 类型的组件、使用 lazy()方法的动态组件等等，不过我们这里主要讲解下函数组件、类组件、html 节点这 3 个；

## 0. 起始

在开始讲解前，我们先定义下要渲染的 React 组件，方便我们后续的理解：

```jsx
const FuncComponent = () => {
  return (
    <p>
      <span>this is function component</span>
    </p>
  );
};

class ClassComponent extends React.Component {
  render() {
    return <p>this is class component</p>;
  }
}

function App() {
  return (
    <div className="App">
      <FuncComponent />
      <ClassComponent />
      <div>
        <span>123</span>
      </div>
    </div>
  );
}

const root = document.getElementById('root');
ReactDOM.render(<App />, root);
```

我们编写这个结构要解决的问题：

1. 函数组件、类组件、html 标签这些分别怎么处理；
2. 处理嵌套的、并列的标签，流程是如何流转的；
3. 初始的element如何处理的？

中间经过多个复杂的过程，才将element转为fiber节点。

### 初始的element如何处理的？

其他的element都可以通过执行函数组件或者类组件的实例来得到，而初始的element是直接提供的。

入口函数 render() 调用了 updateContainer()，在该函数中：

我们去掉dev代码和任务优先级的调度，看下主要的流程：

```javascript
/**
 * 将element结构转为fiber树
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
  /**
   * current:
   * const uninitializedFiber = createHostRootFiber(tag, isStrictMode, concurrentUpdatesByDefaultOverride,);
   */
  // FiberRootNode.current 现在指向到当前的fiber树，
  // 若是初次执行时，current树只有hostFiber节点，没有其他的
  const current = container.current;
  const eventTime = requestEventTime();
  const lane = requestUpdateLane(current);

  // 结合 lane（优先级）信息，创建 update 对象，一个 update 对象意味着一个更新
  /**
   * const update: Update<*> = {
   *   eventTime,
   *   lane,
   *   tag: UpdateState,
   *   payload: null,
   *   callback: null,
   *   next: null,
   * };
   * @type {Update<*>}
   */
  const update = createUpdate(eventTime, lane);
  update.payload = {element};

  // 处理 callback，这个 callback 其实就是我们调用 ReactDOM.render 时传入的 callback
  // 不过从React18开始，render不再传入callback了，即下面的if就不会再执行了
  callback = callback === undefined ? null : callback;
  if (callback !== null) {
    update.callback = callback;
  }

  /**
   * 将update添加到current的更新链表中
   * 执行后，得到的是 current.updateQueue.shared.pending = sharedQueue
   * sharedQueue是React中经典的循环链表，
   * 将下面的update节点插入这个shareQueue的循环链表中，pending指针指向到最后插入的那个节点上
   */
  enqueueUpdate(current, update, lane);

  /**
   * 这里调用的链路很深，做了很多事情，如：
   * 流程图： https://docs.qq.com/flowchart/DS0pVdnB0bmlVRkly?u=7314a95fb28d4269b44c0026faa673b7
   * scheduleUpdateOnFiber() -> ensureRootIsScheduled(root) -> performSyncWorkOnRoot(root)
   * -> renderRootSync(root) -> workLoopSync()
   */
  /**
   * 这里传入的current是HostRootFiber的fiber节点了，虽然他的下面没有其他fiber子节点，
   * 但它的updateQueue上有element结构，可以用来构建fiber节点
   * 即 current.updateQueue.shared.pending = sharedQueue，element结构在sharedQueue其中的一个update节点，
   * 其实这里只有一个update节点
   */
  const root = scheduleUpdateOnFiber(current, lane, eventTime);
  if (root !== null) {
    entangleTransitions(root, current, lane);
  }

  return lane;
}
```






