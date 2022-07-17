# 前期准备工作

> 我们解析的源码是React18.0.2版本，请注意版本号。

我们接下来的文章是进行React源码解析的，已默认您已很熟练使用React，并阅读过[React的官方文档](https://zh-hans.reactjs.org/docs/getting-started.html)。

我们在阅读React源码之前，先熟悉几个概念，这样读起来会顺畅很多。

## 1. 什么是jsx

我们在React中写的类似于html的结构就被称为JSX，但他并不是html，而是一个JavaScript的语法扩展。即他是js，而不是html。

官方文档：
* [JSX 简介](https://zh-hans.reactjs.org/docs/introducing-jsx.html)
* [深入 JSX](https://zh-hans.reactjs.org/docs/jsx-in-depth.html)

```jsx
const App = () => {
  const handleClick = () => {
    console.log('click');
  };
  
  return (<div onClick={handleClick}>
    <p>hello world</p>
  </div>);
};
```

这里我们不讲解jsx的使用方式，主要说下JSX的作用。jsx是js的语法糖，方便我们开发者的维护。最后实际上会被React(React16.x及之前)或babel编译(React17.0及更新)成用createElement编译的结构。

同样的，我们在React中像下面这样写的效果是一样的：

```javascript
createElement('div', { onClick: handleClick },
  createElement('p', null, 'hello world')
)
```

## 2. createElement是用来干嘛的

上面提到会将jsx编译成由createElement()函数组成的一个嵌套结果。那么createElement里具体都干了什么呢？

在React16及之前，createElement()方法是React中的一个方法，因此有些同学就会有疑问，在写`.jsx`的组件时，本来没用到React中的方法，但还是要引入React。就如上面的代码，在React16及之前，要在头部显式地将React import进来。

```jsx
import React from 'react';
```

最终转换出的代码是：

```javascript
React.createElement('div', { onClick: handleClick },
  React.createElement('p', null, 'hello world')
)
```

但从React17开始，若用不到React中的方法，就不用再显式的引入React了。这是因为React和babel合作，将jsx的转换工作放到了编译工具babel中。

新的 JSX 转换不会将 JSX 转换为 React.createElement，而是自动从 React 的 package 中引入新的入口函数并调用。

假设你的源代码如下：

```jsx
function App() {
  return <h1>Hello World</h1>;
}
```

下方是新 JSX 被转换编译后的结果：

```javascript
// 由编译器引入（禁止自己引入！）
import {jsx as _jsx} from 'react/jsx-runtime';

function App() {
  return _jsx('h1', { children: 'Hello world' });
}
```

注意，此时源代码无需引入 React 即可使用 JSX 了！若仍然要使用React提供的Hook等功能，还是需要引入React的。

可以看到新jsx()和之前的React.createElement()方法转换出来的结构稍微有点区别。之前的React.createElement()方法里，子结构会通过第三个参数进行传入；而在jsx()方法中，这里将子结构放到了第二个参数的children字段里，第3个字段则用于传入设置的key属性。若子结构中只有一个子元素，那么children就是一个jsx()，若有多个元素时，则会转为数组：

```javascript
const App = () => {
  return jsx("div", {
    children: jsx("p", {
      children: [
        jsx("span", {
          className: "dd",
          children: "hello world"
        }),
        _jsx("span", {
          children: "123"
        })
      ]
    })
  });
};
```

这里有个babel的在线网站，我们可以编写一段React代码，能实时看到通过babel编译后的效果：[React通过babel实现新的jsx转换](https://babeljs.io/repl/#?browsers=defaults%2C%20not%20ie%2011%2C%20not%20ie_mob%2011&build=&builtIns=false&corejs=3.21&spec=false&loose=false&code_lz=JYWwDg9gTgLgBAJQKYEMDGMAiB5AsnAMyghDgHIpUMBaAExLIG4AoZtCAOwGd4BBMMHAC8cABQBKYQD44Ab2YBISjACuUDmIA8tYADcpzOEbgLNYA8csnNXMCg0BrJAE8hAIhQAjNG6kALJAAbQIg4AHdoQNpNAHpbewsrI1jzQ2NYnX1xFgBfFnZueGIIeBFkdCw8ADo0ShQYJAQIEtF6NBUQJA4YKoBzJBgAUUCkTu6AIWcASVpRCmaYMkkULjgACQAVXAAZYdGumGzmYp7KDlokKFE0zXKMKoBlGChgDFwIC8Tk_kEYxNi7j0ni83h8kAYjkA&debug=false&forceAllTransforms=false&shippedProposals=false&circleciRepo=&evaluate=false&fileSize=false&timeTravel=false&sourceType=module&lineWrap=true&presets=react%2Ctypescript&prettier=false&targets=&version=7.18.5&externalPlugins=&assumptions=%7B%7D)。若jsx的转换方式还是旧版的，请在左侧的配置中，将React Runtime设置为 automatic 。

那么jsx()方法里具体是怎么执行的呢？最后返回了样子的数据呢？源码位置：[jsx()](https://github.com/wenzi0github/react/blob/7a53120fb909084785e4192787bf712f0c0e2ea7/packages/react/src/jsx/ReactJSXElement.js#L241)。

jsx()方法会先进行一系列的判断

相关链接： [介绍全新的 JSX 转换](https://zh-hans.reactjs.org/blog/2020/09/22/introducing-the-new-jsx-transform.html)。

jsx()方法中，会经过一些判断，将key和ref两个比较特殊的属性单独提取出来。

```javascript
/**
 * 将jsx编译为普通的js树形结构
 * @param {string|function} type 若节点为普通html标签时，type为标签的tagName，若为组件时，即为该函数
 * @param {object} config 该节点所有的属性，包括children
 * @param {string?} maybeKey 显式地设置的key属性
 * @returns {*}
 */
export function jsx(type, config, maybeKey) {
  let propName;

  // Reserved names are extracted
  const props = {};

  let key = null;
  let ref = null;
  
  // 若设置了key，则使用该key
  if (maybeKey !== undefined) {
    if (__DEV__) {
      checkKeyStringCoercion(maybeKey);
    }
    key = '' + maybeKey;
  }

  // 若config中设置了key，则使用config中的key
  if (hasValidKey(config)) {
    if (__DEV__) {
      checkKeyStringCoercion(config.key);
    }
    key = '' + config.key;
  }

  // 提取设置的ref属性
  if (hasValidRef(config)) {
    ref = config.ref;
  }

  // Remaining properties are added to a new props object
  // 剩余属性将添加到新的props对象中
  for (propName in config) {
    if (
      hasOwnProperty.call(config, propName) &&
      !RESERVED_PROPS.hasOwnProperty(propName)
    ) {
      props[propName] = config[propName];
    }
  }
  
  /**
   * 我们的节点有有三种类型：
   * 1. 普通的html标签，type为该标签的tagName，如div, span等；
   * 2. 当前是Function Component节点时，则type该组件的函数体，即可以执行type()；
   * 3. 当前是Class Component节点，则type为该class，可以new出一个实例；
   * 而type对应的是Function Component时，可以给该组件添加defaultProps属性，
   * 当设置了defaultProps，则将未明确传入的属性给到props里
   */
  // Resolve default props
  if (type && type.defaultProps) {
    const defaultProps = type.defaultProps;
    for (propName in defaultProps) {
      if (props[propName] === undefined) {
        props[propName] = defaultProps[propName];
      }
    }
  }

  /**
   * 参数处理完成后，就调用ReactElement()方法返回一个object结构
   */
  return ReactElement(
    type,
    key,
    ref,
    undefined,
    undefined,
    ReactCurrentOwner.current,
    props,
  );
}
```

ReactElement()方法的作用就是返回一个object结构，我们这里把所有的提示代码都去掉：

```javascript
/**
 * Factory method to create a new React element. This no longer adheres to
 * the class pattern, so do not use new to call it. Also, instanceof check
 * will not work. Instead test $$typeof field against Symbol.for('react.element') to check
 * if something is a React Element.
 */
const ReactElement = function(type, key, ref, self, source, owner, props) {
  const element = {
    // This tag allows us to uniquely identify this as a React Element
    $$typeof: REACT_ELEMENT_TYPE, // 用来标识当前是否是React元素

    /**
     * 我们的节点有有三种类型：
     * 1. 普通的html标签，type为该标签的tagName，如div, span等；
     * 2. 当前是Function Component节点时，则type该组件的函数体，即可以执行type()；
     * 3. 当前是Class Component节点，则type为该class，可以通过该type，new出一个实例；
     * 而type对应的是Function Component时，可以给该组件添加defaultProps属性，
     * 当设置了defaultProps，则将未明确传入的属性给到props里
     */
    // Built-in properties that belong on the element
    type: type,
    key: key,
    ref: ref,
    props: props,

    // Record the component responsible for creating this element.
    _owner: owner,
  };
  
  return element;
};
```

上面方法注释的大概意思是：现在不再使用类的方式new出一个实例来，因此不再使用instanceOf来判断是否是React元素；而是判断$$typeof字段是否等于`Symbol.for('react.element')`来判断。

我们已经知道 $$typeof 字段的作用是为了标识React元素的，但他的值为什么用Symbol类型呢？稍后我们会单独开辟一篇文章来讲解。这里我们只需要了解该字段是用来是否是React element类型的即可。

到目前位置，我们已经知道了jsx在传入render()方法之前，会编译成什么样子。

我们在`*.jsx`文件中，先直接输出下jsx的结构：

```jsx
console.log(<div>
  <span>hello world</span>
</div>);
```

在控制台里就能看到这样的结构：

![jsx编译后的结构效果](https://mat1.gtimg.com/qqcdn/tupload/1657818568337.png)

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

我们再输出一个完整的组件，如一个App组件如下：

```jsx
const App = ({ username }) => {
    return (<div>
      <span>hello {username}</span>
    </div>);
};
```

分别输出下App和<App />：

```javascript
console.log(<App />, App);
```

![React组件的jsx编译后](https://mat1.gtimg.com/qqcdn/tupload/1657818568340.png)

单纯的`App`是一个函数，function类型，但这里不能直接执行`App()`，会报错的；而`<App />`则是一个json结构，object类型的，其本来的方法则存放到了type字段中。

我们在上面的代码中已经说了type字段的含义，这里再说下跟type相关的children字段。当type为html标签时，children就其下面所有的子节点。当只有一个子节点时，children为object类型，当有多个子节点时，children是array类型。

有些同学可能一时反应不过来，觉得组件<App />的children是其内部返回的jsx结构。这是不对的。这里我们要把组件也当做一个跟普通html标签一样的标签来对待，组件的children就是该组件标签包裹的内容。组件里的内容，可以通过执行`type`字段对应的function或class来获得。如：

```jsx
const Start = (<div>
    <App>
        <p>this is app children</p>
    </App>  
</div>);
```

这里`<App>`标签里的p标签才是他的children。

因此，在传入到render()方法时，就是这样子的一个object类型的element元素。

## 3. fiber结构

在上面通过babel转换后的object类似的数据，会在render()方法中将其转为fiber结构。render()方法里具体怎样转换的，我们稍后再讲，这里我们只是看下fiber节点的结构。

```javascript
/**
 * 创建fiber节点
 * @param {WorkTag} tag
 * @param {mixed} pendingProps
 * @param {null | string} key
 * @param {TypeOfMode} mode
 * @constructor
 */
function FiberNode(
  tag: WorkTag,
  pendingProps: mixed,
  key: null | string,
  mode: TypeOfMode,
) {
  // Instance
  this.tag = tag; // 当前节点的类型，如 FunctionComponent, ClassComponent 等

  /**
   * 这个字段和 react element 的 key 的含义和内容有一样（因为这个 key 是
   * 从 react element 的key 那里直接拷贝赋值过来的），作为 children 列表
   * 中每一个 item 的唯一标识。它被用于帮助 React 去计算出哪个 item 被修改了，
   * 哪个 item 是新增的，哪个 item 被删除了。
   * @type {string}
   */
  this.key = key;
  this.elementType = null;

  /**
   * 当前fiber节点的元素类型，与React Element里的type类型一样，若是原生的html标签，
   * 则 type 为该标签的类型（'div', 'span' 等）；若是自定义的Class Component或
   * Function Component等，则该type的值就是该class或function，后续会按照上面的tag字段，
   * 来决定是用new初始化一个实例（当前是 Class Component），然后执行该class内
   * 的render()方法；还是执行该type（当前是 Function Component），得到其返回值；
   */
  this.type = null;
  this.stateNode = null;

  /**
   * 下面的return, child和sibling都是指针，用来指向到其他的fiber节点，
   * React会将jsx编译成的element结构，转为以fiber为节点的链表结构，
   * return: 指向到父级fiber节点；
   * child: 指向到该节点的第1个子节点；
   * sibling: 指向到该节点的下一个兄弟节点；
   * 如图所示：https://pic4.zhimg.com/80/v2-a825372d761879bd1639016e6db93947_1440w.jpg
   */
  this.return = null;
  this.child = null;
  this.sibling = null;
  this.index = 0;

  this.ref = null;

  this.pendingProps = pendingProps;
  this.memoizedProps = null;
  this.updateQueue = null;
  this.memoizedState = null;
  this.dependencies = null;

  this.mode = mode;

  // Effects
  this.flags = NoFlags; // 该节点更新的优先级，若为NoFlags时，则表示不更新
  this.subtreeFlags = NoFlags; // 子节点的更新情况，若为NoFlags，则表示其子节点不更新，在diff时可以直接跳过
  this.deletions = null; // 子节点中需要删除的节点

  this.lanes = NoLanes;
  this.childLanes = NoLanes;

  /**
   * 双缓冲：防止数据丢失，提高效率（之后Dom-diff的时候可以直接比较或者使用
   * React在进行diff更新时，会维护两颗fiber树，一个是当前正在展示的，一个是
   * 通过diff对比后要更新的树，这两棵树中的每个fiber节点通过 alternate 属性
   * 进行互相指向。
   */
  this.alternate = null;
}
```

React中大到组件，小到html标签，都会转为fiber节点构建的fiber链表。

为什么要使用fiber链表？这里我们稍微了解下，后面会详细介绍fiber链表如何进行diff每个fiber节点的。

### Stack Reconciler

在 React 15.x 版本以及之前的版本，Reconciliation 算法采用了栈调和器（ Stack Reconciler ）来实现，但是这个时期的栈调和器存在一些缺陷：不能暂停渲染任务，不能切分任务，无法有效平衡组件更新渲染与动画相关任务的执行顺序，即不能划分任务的优先级（这样有可能导致重要任务卡顿、动画掉帧等问题）。Stack Reconciler 的实现。

### Fiber Reconciler

为了解决 Stack Reconciler 中固有的问题，以及一些历史遗留问题，在 React 16 版本推出了新的 Reconciliation 算法的调和器—— Fiber 调和器（Fiber Reconciler）来替代栈调和器。Fiber Reconciler 将会利用调度器（Scheduler）来帮忙处理组件渲染/更新的工作。此外，引入 fiber 这个概念后，原来的 react element tree 有了一棵对应的 fiber node tree。在 diff 两棵 react element tree 的差异时，Fiber Reconciler 会基于 fiber node tree 来使用 diff 算法，通过 fiber node 的 return、child、sibling 属性能更方便的遍历 fiber node tree，从而更高效地完成 diff 算法。

### Fiber Reconciler 功能(优点)

1. 能够把可中断的任务切片处理;
2. 能够调整任务优先级，重置并复用任务；
3. 可以在父子组件任务间前进后退切换任务；
4. render 方法可以返回多个元素（即可以返回数组）；
5. 支持异常边界处理异常；



