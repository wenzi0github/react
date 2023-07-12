# React18 源码解析之 useReducer 的原理

> 我们解析的源码是 React18.1.0 版本，请注意版本号。React 源码学习的 GitHub 仓库地址：[https://github.com/wenzi0github/react](https://github.com/wenzi0github/react)。

在浏览该文章前，请一定要先看文章[React18 源码解析之 useState 的原理](https://www.xiabingbao.com/post/react/react-usestate-rn5bc0.html)。不过若您看完关于 useState() 的文章后，其实 `useReducer` 的源码也就不用讲了。

## 1. useReducer() 的用法

我们先来看下 useReducer 的用法。

useState() 实际上相当于 useReducer() 的简化版（或者定制版）。我们已经提前约定好了 dispatch()（即 setState()）内部的功能。但若执行的操作比较复杂，useState() 无法满足我们的需要时，可以通过 useReducer() 来可以自定义 reducer，来实现相对复杂的状态变更。

然后传给 useReducer()的第 1 个参数（第 2 个参数是 state 的初始值）。

useReducer() 的 hook 接收两个参数：

- reducer: 执行 dispatch() 时的具体操作，该回调方法有两个参数，第 1 个是当前的状态，第 2 个是 dispatch()传入的数据；返回值即为要更新的状态；
- initialState: 状态的初始值；

先来看一个 useReducer() 的简单的例子：

```javascript
// 设置初始值
const initialState = { count: 0 };

// 自定义一个 reducer
function reducer(state, action) {
  switch (action.type) {
    case 'increment': {
      return { count: state.count + 1 };
    }
    case 'decrement': {
      return { count: state.count - 1 };
    }
    default: {
      return state;
    }
  }
}

function Counter() {
  const [state, dispatch] = useReducer(reducer, initialState);

  return (
    <>
      Count: {state.count}
      <button onClick={() => dispatch({ type: 'decrement' })}>-</button>
      <button onClick={() => dispatch({ type: 'increment' })}>+</button>
    </>
  );
}
```

useReducer 的返回值是一个数组，数组中包含两个元素：

- state：当前的状态值。
- dispatch：一个用于触发状态更新的函数。当 dispatch 被调用时，会触发 reducer 函数，并传递当前状态和 action 作为参数。

按照习惯，我们一般约定，action 参数中通常有两个属性：

- type: 当前操作的类型；
- payload: 传入的数据，但不是必须的；

与 useState 相比，useReducer 的优点在于它可以管理更加复杂的状态，并且状态更新更加可控、可预测。同时，若多个 state 的变化过程一样的，还可以共用 reducer。

## 2. mountReducer() 的源码解析

mountReducer()跟 mountState() 的代码几乎一样：

![mountReducer 与 mountState 的对比](https://www.xiabingbao.com/upload/78826487473610a52.png)

可以看到 mountState() 中是指定了 reducer 的，而 mountReducer() 是开发者自行传入的。

该 hook 的挂载过程，可以参考：[hook 的初始挂载 - React18 源码解析之 useState 的原理](https://www.xiabingbao.com/post/react/react-usestate-rn5bc0.html#2+hook+%E7%9A%84%E5%88%9D%E5%A7%8B%E6%8C%82%E8%BD%BD)。（偷个懒）

## 3. updateReducer() 的源码解析

updateReducer()在 React 内部被调用过程中，若 useState() 的操作，则会指定 reducer 为 basicStateReducer。而若是 useReducer() 的操作，则会接收开发者传入的 reducer。

该方法的源码，可以参考：[updateReducer - React18 源码解析之 useState 的原理](https://www.xiabingbao.com/post/react/react-usestate-rn5bc0.html#5.+updateReducer)。

## 4. 总结

useState() 和 useReducer() 中大部分的代码都是复用的，因此跟之前的文章内容比较重复。
