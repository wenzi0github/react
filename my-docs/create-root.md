# 入口方法createRoot

## 使用方式上的变化

在React16.x及以前，是调用`render()`方法渲染的：

```jsx
import ReactDOM from 'react-dom';

const App = () => {
  return (<div className="App">hello world</div);
};

ReactDOM.render(<App />, document.getElementById('root'));
```

同时`render()`方法还可以传入第3个参数，在虚拟dom渲染完毕后，会执行这个回调函数。

但从React17.0开始，这里多了一个`createRoot()`方法：

```jsx
import ReactDOM from 'react-dom/client';

const App = () => {
  return (<div className="App">hello world</div);
};
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
```

可以看到与之前的引入方式和使用方式稍微有点区别，新版中是从`react-dom/client`中引入的，而且这里会先调用`createRoot()`生成一个root实例，然后这个实例再调用render()方法。这里的render()方法只能传入一个参数，就是一个ReactElement，若想要监听虚拟dom是否渲染完毕，可以自行在组件中实现。

那么createRoot里发生了什么呢？

## createRoot 里发生了什么

简单地说：

1. 创建两个节点，一个是 FiberRootNode 类型的节点，一个是 FiberNode 类型的节点；FiberRootNode 类型的节点在整个应用中只有这一个，用于指定要展示哪棵树；FiberNode类型的节点在这里是空树；（React在进行数据更新时，会存在两棵树，一个是current，表示当前正在展示的那棵树，一个是workInProgress，表示更新数据后将要展示的树；FiberRootNode默认是指向到current，当workInProgress更新完毕后，就会执行到这棵树；因此，若FiberRootNode没有指向workInProgress时，它可以进行形式地更新或者中断之类的操作，对用户来说是无感知的）；
2. 将事件挂载到root节点上；（以前是挂载到document上，不过现在是挂载到传入的dom节点上）；
3. 返回ReactDOMRoot(FiberRootNode)的实例；（这里将FiberRootNode传入，实例的属性_internalRoot指向到这个节点上；同时，ReactDOMRoot的这个class还通过prototype实现了两个方法：render()和unmount()）；

稍微复杂点的，就是多了一些判断逻辑和提示，如：

1. 判断传入的dom是否是一个有效的挂载节点，如传入的是一个文本节点就不能挂载；
2. 若传入的dom节点已经使用了（即已经作为React的挂载节点了），给出警告；
3. 挂载事件到某dom元素上时，判断传入的dom元素是否是注释类型的元素，若不是则直接使用，否则使用他的父级元素；

上面一系列的判断完成后，就会执行下面的方法，返回ReactDOMRoot的一个实例：

```javascript
return new ReactDOMRoot(FiberRootNode);
```

那么我们上面调用的render()方法，实际上就是ReactDOMRoot这个class里的方法。

## render

render()方法传进来的，是jsx已经被转换好的虚拟dom（即如 <App />）。在React16.x版本及之前，都是React内置的模块来将jsx转成虚拟DOM的，因此即使没有React中任何相关的特性，也得要显式地引入React；而从React17.0开始，jsx的转换任务则交给了babel来处理，这时就不用再刻意地引用了；当然，如果需要用到React里的一些特性，还是要引入的。

官方文档：[介绍全新的 JSX 转换](https://zh-hans.reactjs.org/blog/2020/09/22/introducing-the-new-jsx-transform.html)

render()的作用就是将jsx转为一棵完整的fiber树。

```jsx
root.render(<App />);
```

这里会先进行一系列的判断，若有一些使用不当的地方，提前给出警告，如：

1. FiberRootNode类型的fiber节点，我们在上面说过可以理解为整个fiber树的起始节点，若该节点为null，说明整个fiber树已被卸载；
2. render()方法现在只能传入一个参数，即如<App />的虚拟DOM树，并没有第2个参数；若用户可能出于之前的使用习惯，会给第2个参数传入callback或dom节点等，这里给出错误提示；

正常执行时，就会调用 updateContainer() 方法了。这里的updateContainer分了两个方法：updateContainer_old 和 updateContainer_new。在目前18.0.2版本里，使用的是 updateContainer_old() 方法。

updateContainer_old() 方法在 packages/react-reconciler/src/ReactFiberReconciler.old.js 的文件中。

updateContainer()方法里的几个知识点： 

在初次更新时，current树为空，我们只能渲染element树（这个element树是从jsx更新过来的）；调用enqueueUpdate()方法，将element放到current的更新队列中，即：

```javascript
const current = container.current; // FiberRootNode.current 现在指向到当前的fiber树，若是初次执行时，current树只有hostFiber节点，没有其他的

// 结合 lane（优先级）信息，创建 update 对象，一个 update 对象意味着一个更新
const update = createUpdate(eventTime, lane);
// Caution: React DevTools currently depends on this property
// being called "element".
update.payload = {element};

/**
 * 将update添加到current的更新链表中
 * 执行后，得到的是 current.updateQueue.shared.pending = sharedQueue
 * sharedQueue是React中经典的循环链表，
 * 将下面的update节点插入这个shareQueue的循环链表中，pending指针指向到最后插入的那个节点上
 */
enqueueUpdate(current, update, lane);
```

接下来就得要进入schedule节点了（scheduleUpdateOnFiber()）。还会做的几件事儿有：

1. 设置状态，在React18中，已经使用lane来标记各个fiber节点的优先级了；
2. prepareFreshStack(): 设置 rootWorkInProgress，workInProgress；
3. 初始化时，执行



