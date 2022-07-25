> 我们解析的源码是 React18.1.0 版本，请注意版本号。React 源码学习的 GitHub 仓库地址：[https://github.com/wenzi0github/react](https://github.com/wenzi0github/react)。

## 1. render() 方法的使用

render() 方法是整个 React 应用的入口方法，所有的 jsx 渲染、hook 的挂载和执行等，都在这个里面。

从 React18 开始，`render()`方法的使用跟之前不一样了。

之前的使用方式：

```jsx
import ReactDOM from 'react-dom';

const root = document.getElementById('root');
ReactDOM.render(<App />, root);
```

新的使用方式：

```jsx
// React18.x
import ReactDOM from 'react-dom/client';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));

root.render(<App />);
```

对比后，发现有几点不一样的使用方式：

1. ReactDOM 改成了从`react-dom/client`引入；
2. render()方法的调用方改变了，从之前的 ReactDOM 变成了 ReactDOM.createRoot() 创建后的实例；
3. render()方法的参数发生了改变，之前是 2 个固定参数加一个可选的 callback，分别是 jsx 组件，dom 节点和可选的 callback，这个 callback 在 dom 渲染完毕后执行；新 render()方法中，只有一个必传的参数，即 jsx 组件，若想实现之前的 callback 功能，这里建议使用 useEffect()。

## 2. createRoot()

源码位置：[ReactDOMRoot.js#L185](https://github.com/wenzi0github/react/blob/6bef98a66fb9e05119d75bd44f7d0190758ed7f8/packages/react-dom/src/client/ReactDOMRoot.js#L185)。

createRoot()函数有两个参数，第 1 个是传入一个 dom 节点，第 2 个是可选的配置参数，我们暂时先不管 options 的配置，先把这些配置代码删去，只看大流程。

```javascript
export function createRoot(container: Element | Document | DocumentFragment, options?: CreateRootOptions): RootType {
  // 判断container是否是合法的dom元素
  if (!isValidContainer(container)) {
    throw new Error('createRoot(...): Target container is not a DOM element.');
  }

  // 若container为body或已被作为root使用过，则在dev环境发出警告
  warnIfReactDOMContainerInDEV(container);

  let isStrictMode = false;
  let concurrentUpdatesByDefaultOverride = false;
  let identifierPrefix = '';
  let onRecoverableError = defaultOnRecoverableError;
  let transitionCallbacks = null;

  /**
   * 创建一个 FiberRootNode 类型的节点，fiberRootNode 是整个应用的根节点
   * 在react的更新过程中，会有current(当前正在展示)和workInProgress(将要更新的)两个fiber树，
   * fiberRootNode 默认指向到current,
   * workInProgress更新并commit完毕后，fiberRootNode会指向到workProgress
   * 调用链路： createContainer() -> createFiberRoot() -> {new FiberRootNode(), createHostRootFiber()} -> createFiber() -> new FiberNode()
   * root节点是通过 new FiberRootNode() 初始化出来的实例，属性也非常多，
   * 当前我们可以只关注其中的两个属性：
   * root.current: 指向到哪棵fiber树；初始化时会指向到一颗空树，因为刚开始时还没有树；
   * root.containerInfo: 创建当前节点时的dom节点
   */
  const root = createContainer(
    container,
    ConcurrentRoot, // 1
    null,
    isStrictMode,
    concurrentUpdatesByDefaultOverride,
    identifierPrefix,
    onRecoverableError,
    transitionCallbacks,
  );
  // 将DOM节点 container 标记为已被作为root使用过
  // 并通过一个属性指向到fiber节点：
  // container['__reactContainer$'] = root.current; // root为fiber类型的节点
  // 这里就形成了互相指向，root.containerInfo = container;
  markContainerAsRoot(root.current, container);

  // 获取container的真实element元素，若container是注释类型的元素，则使用其父级元素，否则直接使用container
  // 大概是因为注释节点无法挂载事件
  const rootContainerElement: Document | Element | DocumentFragment =
    container.nodeType === COMMENT_NODE ? (container.parentNode: any) : container;

  // 绑定所有可支持的事件到 rootContainerElement 节点上
  listenToAllSupportedEvents(rootContainerElement);

  // 使用ReactDOMRoot实例化一个对象，属性_internalRoot 指向到到 root
  // 并有两个方法 render() 和 unmount()
  return new ReactDOMRoot(root);
}
```

我们再提炼下其中的流程：

1. isValidContainer(container): 判断传入的 dom 节点 container 是否是个合法的挂载对象，如普通的 element 节点（如`<div>`, `<p>`等），document 节点，文档片段节点等，都是合法的挂载对象；额外的，注释节点就不是一个合法的挂载对象；
2. warnIfReactDOMContainerInDEV(container): 若 container 为 body 或已被作为 root 使用过，则在 dev 环境发出警告；
3. const root = createContainer(container): 创建一个 FiberRootNode 类型的节点，在 React 中，存在两棵树， FiberRootNode 用来决定指向到哪棵树；
4. markContainerAsRoot(root.current, container): 将 container 标记上，若重复使用，则发出警告；
5. listenToAllSupportedEvents(rootContainerElement): 挂载事件，若传入的 container 是注释类型元素，则使用其父级节点挂载事件；jsx 中的诸如 onClick, onChange 等事件，并不是真的挂载当前节点上的，而是通过事件代理（又称事件委托）的方式，将事件冒泡到根节点上进行处理。
6. new ReactDOMRoot(root): 最终返回一个 ReactDOMRoot(root) 的实例，render()方法就是这个类的一个实例；

上面的每个函数我们都没有去关注他具体的实现，只是先看下大致的流程，避免因太多深入某一项，导致忘记大局流程，造成思维混乱。我们可以看到上面的`createContainer()`函数的调用链路很深，一直到最终的 FiberNode() 函数。这里我们仅了解这些函数的大致功能，后续我们会一一进行解析。

## 3. ReactDOMRoot() 类的实现

ReactDOMRoot()类还是在当前的文件中：[ReactDOMRoot()的实现](https://github.com/wenzi0github/react/blob/6bef98a66fb9e05119d75bd44f7d0190758ed7f8/packages/react-dom/src/client/ReactDOMRoot.js#L93)。

类的主体简单，就是将上层创建的 FiberRootNode 类型的节点放到实例的 \_internalRoot 属性上。

```javascript
/**
 * 创建一个实例，并可以调用render()方法
 * @param {FiberRoot} internalRoot
 * @constructor
 */
function ReactDOMRoot(internalRoot: FiberRoot) {
  this._internalRoot = internalRoot;
}

/**
 * render的入口
 * @param {ReactNodeList} children 通过createElement或babel转换后的element结构
 * element结构 { $$typeof, type, props, key, ref }
 * 不过这里如null, boolean等类型，也认为是有效的children类型
 */
ReactDOMHydrationRoot.prototype.render = ReactDOMRoot.prototype.render = function(children: ReactNodeList): void {};

// 卸载
ReactDOMHydrationRoot.prototype.unmount = ReactDOMRoot.prototype.unmount = function(): void {};
```

这里用原型链的方式，为 ReactDOMRoot 类添加了两个方法：render() 和 unmout();

### 3.1 render() 方法

终于讲到了 render() 方法，render() 大部分的操作都是进行参数的校验，避免开发者因之前使用 render() 方法的习惯，造成使用错误。最后调用 `updateContainer()` 方法来实现后续的操作。

```javascript
/**
 * render的入口
 * @param {ReactNodeList} children 通过createElement或babel转换后的element结构
 * element结构 { $$typeof, type, props, key, ref }
 * 不过这里如null, boolean等类型，也认为是有效的children类型
 */
ReactDOMHydrationRoot.prototype.render = ReactDOMRoot.prototype.render = function(children: ReactNodeList): void {
  const root = this._internalRoot; // FiberRootNode
  if (root === null) {
    // 若root为null，说明该树已被卸载
    throw new Error('Cannot update an unmounted root.');
  }

  // 省略一堆的参数校验

  updateContainer(children, root, null, null);
};
```

updateContainer() 函数会做很多，如会将 element 结构转为 fiber 树，并最终生成 html 节点渲染到 root.containerInfo 指定的 dom 元素中；将组件中声明的 hook 挂载到 hook 链表中。

我们现在再单独看下对参数的校验，这里不影响整体功能，您也可以直接跳过。这些参数的校验，主要是为了给使用之前版本的用户进行提示，毕竟很多开发者对框架的使用有很大的惯性，当 api 的使用方式有变动时，最好给到足够的提示，可以让用户知道怎么去适配最新的使用方式：

```javascript
if (typeof arguments[1] === 'function') {
  // 第2个参数是function时，给出提示，render方法不再支持callback，而应当放在useEffect()中
  // 主要是为了给使用之前版本的用户进行提示
  console.error(
    'render(...): does not support the second callback argument. ' +
      'To execute a side effect after rendering, declare it in a component body with useEffect().',
  );
} else if (isValidContainer(arguments[1])) {
  // 若第2个参数是一个挂载dom节点，给出提示，若是通过createRoot创建然后调用render的，第2个参数不用再传入dom节点
  // 主要是为了给使用之前版本的用户进行提示
  // 之前是ReactDOM.render(<App />, document.getElementById('root'));的用法，但现在不这么使用了
  console.error(
    'You passed a container to the second argument of root.render(...). ' +
      "You don't need to pass it again since you already passed it to create the root.",
  );
} else if (typeof arguments[1] !== 'undefined') {
  // root.render()只能传入一个参数
  console.error('You passed a second argument to root.render(...) but it only accepts ' + 'one argument.');
}

// 真实的dom元素
const container = root.containerInfo;

if (container.nodeType !== COMMENT_NODE) {
  // 这里暂时还不没看懂 findHostInstanceWithNoPortals() 函数的原理，
  // 意思是container中的内容被React之外的方法移除，导致React无法正常工作
  // 这里应当使用React提供的unmount()方法来清楚container中的内容
  const hostInstance = findHostInstanceWithNoPortals(root.current);
  if (hostInstance) {
    if (hostInstance.parentNode !== container) {
      console.error(
        'render(...): It looks like the React-rendered content of the ' +
          'root container was removed without using React. This is not ' +
          'supported and will cause errors. Instead, call ' +
          "root.unmount() to empty a root's container.",
      );
    }
  }
}
```

### 3.2 unmount() 方法

unmount() 方法相对来说就简单很多，主要是用来清除数据、卸载 fiber 树等。

```javascript
ReactDOMHydrationRoot.prototype.unmount = ReactDOMRoot.prototype.unmount = function(): void {
  if (__DEV__) {
    if (typeof arguments[0] === 'function') {
      // 若传入了callback参数，则给出提示，要想在组件卸载时进行回调，
      // 请使用useEffect()
      console.error(
        'unmount(...): does not support a callback argument. ' +
          'To execute a side effect after rendering, declare it in a component body with useEffect().',
      );
    }
  }
  const root = this._internalRoot; // FiberRootNode节点，我们在new的时候，将其给到了该属性
  if (root !== null) {
    this._internalRoot = null; // 置为空
    const container = root.containerInfo; // dom元素

    flushSync(() => {
      // 解除root中的所有fiber节点
      updateContainer(null, root, null, null);
    });

    /**
     * 我们在createRoot中，将root.current给到了container属性，标记container为已使用
     * container['__reactContainer$'] = root.current;
     * 这里我们将其解除指向：
     * container['__reactContainer$'] = null;
     */
    unmarkContainerAsRoot(container);
  }
};
```

## 4. 总结

入口方法 render() 我们初步的流程大致了解了，不过有很多重要的函数都没有展开说，如 createContainer(), listenToAllSupportedEvents(), updateContainer()等等，接下来我们都会一一讲解到。
