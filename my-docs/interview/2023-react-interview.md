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

### useCallback 和 useMemo 的使用场景

### useState 的传参方式，有什么区别？

## 2. 源码层面上

这部分考察的就更有深度一些了，多多少少得了解一些源码，才能明白其中的缘由，比如 React 的 diff 对比，循环中 key 的作用等。

### 真实 dom 和虚拟 dom，谁快？

### 什么是合成事件，与原生事件有什么区别？

## 3. 周边生态

这部分主要考察 React 周边生态配套的了解，如状态管理库 redux、mobx，路由组件 react-router-dom 等。
