# 2023 年最新最全的 React 面试题

React 作为前端使用最多的框架，必然是面试的重点核实。我们接下来主要从 React 的使用方式、源码层面和周边生态（如 redux, react-router 等）等几个方便来进行总结。

## 1. 使用方式上

这里主要考察的是，在开发使用过程中，对 React 框架的了解，如 hook 的不同调用方式得到的结果、函数组件中的 useState 和类组件的 state 的区别等等。

### props 的变动，是否会引起 state hook 中数据的变动？

React 组件的 props 变动，会让组件重新执行，但并不会引起 state 的值的变动。state 值的变动，只能由 setState() 来触发。因此若想在 props 变动时，重置 state 的数据，需要监听 props 的变动，如：

```javascript
const App = props => {
  const [count, setCount] = useState(0);

  // 监听 props 的变化，重置 count 的值
  useEffect(() => {
    setCount(0);
  }, [props]);

  return <div onClick={() => setCount(count + 1)}>{count}</div>;
};
```

### React18 有哪些新变化？

React 的更新都是渐进式的更新，在 React18 中启用的新特性，其实在 v17 中（甚至更早）就埋下了。

1. 并发渲染机制：根据用户的设备性能和网速对渲染过程进行适当的调整， 保证 React 应用在长时间的渲染过程中依旧保持可交互性，避免页面出现卡顿或无响应的情况，从而提升用户体验。
2. 新的创建方式：现在是要先通过`createRoot()`创建一个 root 节点，然后该 root 节点来调用`render()`方法；
3. 自动批处理优化：批处理： React 将多个状态更新分组到一个重新渲染中以获得更好的性能。（将多次 setstate 事件合并）；在 v18 之前只在事件处理函数中实现了批处理，在 v18 中所有更新都将自动批处理，包括 promise 链、setTimeout 等异步代码以及原生事件处理函数；
4. startTransition：主动降低优先级。比如「搜索引擎的关键词联想」，用户在输入框中的输入希望是实时的，而联想词汇可以稍稍延迟一会儿。我们可以用 startTransition 来降低联想词汇更新的优先级；
5. useId：主要用于 SSR 服务端渲染的场景，方便在服务端渲染和客户端渲染时，产生唯一的 id；

### 并发模式是如何执行的？

React 中的`并发`，并不是指同一时刻同时在做多件事情。因为 js 本身就是单线程的（同一时间只能执行一件事情），而且还要跟 UI 渲染竞争主线程。若一个很耗时的任务占据了线程，那么后续的执行内容都会被阻塞。为了避免这种情况，React 就利用 fiber 结构和时间切片的机制，将一个大任务分解成多个小任务，然后按照任务的优先级和线程的占用情况，对任务进行调度。

- 对于每个更新，为其分配一个优先级 lane，用于区分其紧急程度。
- 通过 Fiber 结构将不紧急的更新拆分成多段更新，并通过宏任务的方式将其合理分配到浏览器的帧当中。这样就能使得紧急任务能够插入进来。
- 高优先级的更新会打断低优先级的更新，等高优先级更新完成后，再开始低优先级更新。

### 什么是受控组件和非受控组件？

我们稍微了解下什么是受控组件和非受控组件：

- 受控组件：只能通过 React 修改数据或状态的组件，就是受控组件；
- 非受控组件：与受控组件相反，如 input, textarea, select, checkbox 等组件，本身控件自己就能控制数据和状态的变更，而且 React 是不知道这些变更的；

那么如何将非受控组件改为受控组件呢？那就是把上面的这些纯 html 组件数据或状态的变更，交给 React 来操作：

```javascript
const App = () => {
  const [value, setValue] = useState('');
  const [checked, setChecked] = useState(false);

  return (
    <>
      <input value={value} onInput={event => setValue(event.target.value)} />
      <input type="checkbox" checked={checked} onChange={event => setChecked(event.target.checked)} />
    </>
  );
};
```

上面代码中，输入框和 checkbox 的变化，均是经过了 React 来操作的，在数据变更时，React 是能够知道的。

### 高阶组件（HOC）？

通过参数接收一个组件，然后执行一定的逻辑后，再返回新的函数组件。

参考：[react 进阶」一文吃透 React 高阶组件(HOC)](https://juejin.cn/post/6940422320427106335)

### React 中为什么要使用 Hook？

官方网站有介绍该原因：[使用 Hook 的动机](https://zh-hans.reactjs.org/docs/hooks-intro.html#motivation)。

这里我们简要的提炼下：

1. 在组件之间复用状态逻辑很难：在类组件中，可能需要 render props 和 高阶组件等方式，但会形成“嵌套地域”；而使用 Hook，则可以从组件中提取状态逻辑，是的这些逻辑可以单独测试并复用；
2. 复杂组件变得难以理解：在类组件中，每个生命周期常常包含一些不相关的逻辑。如不同的执行逻辑，都要放在`componentDidMount`中执行和获取数据，而之后需在 `componentWillUnmount` 中清除；但在函数组件中，不同的逻辑可以放在不同的 Hook 中执行，互不干扰；
3. 难以理解的 class：类组件中，充斥着各种对 `this` 的使用，如 `this.onClick.bind(this)`，`this.state`，`this.setState()` 等，同时，class 不能很好的压缩，并且会使热重载出现不稳定的情况；Hook 使你在非 class 的情况下可以使用更多的 React 特性；

### useCallback 和 useMemo 的使用场景

useCallback 和 useMemo 可以用来缓存函数和变量，提高性能，减少资源浪费。但并不是所有的函数和变量都需要用这两者来实现，他也有对应的使用场景。

我们知道 useCallback 可以缓存函数体，在依赖项没有变化时，前后两次渲染时，使用的函数体是一样的。它的使用场景是：

- 函数作为其他 hook 的依赖项时（如在 useEffect()中）；
- 函数作为 React.memo()（或 shouldComponentUpdate ）中的组件的 props；

主要是为了避免重新生成的函数，会导致其他 hook 或组件的不必要刷新。

### useState 的传参方式，有什么区别？

### 为什么在本地开发时，组件会渲染两次？

[issues#2](https://github.com/wenzi0github/react/issues/2)

## 2. 源码层面上

这部分考察的就更有深度一些了，多多少少得了解一些源码，才能明白其中的缘由，比如 React 的 diff 对比，循环中 key 的作用等。

### 真实 dom 和虚拟 dom，谁快？

### 什么是合成事件，与原生事件有什么区别？

## 3. 周边生态

这部分主要考察 React 周边生态配套的了解，如状态管理库 redux、mobx，路由组件 react-router-dom 等。
