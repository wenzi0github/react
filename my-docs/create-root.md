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
2. 若传入的dom节点已经使用了（已经作为React的挂载节点了），给出警告；
3. 挂载事件到某dom元素上时，判断传入的dom元素是否是注释类型的元素，若不是则直接使用，否则使用他的父级元素；

上面一系列的判断完成后，就会执行下面的方法，返回一个实例：

```javascript
return new ReactDOMRoot(FiberRootNode);
```

那么我们上面调用的render()方法，实际上就是ReactDOMRoot这个class里的方法。

## render

render()方法传进来的，是jsx已经被babel转换好的虚拟dom。从React17.0开始，jsx的转换任务则交给了babel来处理
