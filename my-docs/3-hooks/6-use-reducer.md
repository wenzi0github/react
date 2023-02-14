## 5. updateReducer

实际上，我们也顺手把 useReducer() 的源码也讲解了。为了讲解 updateReducer()，就先来了解下 useReducer() 这个 hook 的用法。

useState() 实际上相当于 useReducer() 的简化版，或者定制版。我们已经提前约定好了 set 功能的 action 类型。但若执行的操作比较复杂，useState()无法满足我们的需要时，就可以自定义 reducer，然后传给 useReducer()的第 1 个参数（第 2 个参数是 state 的初始值）。

```javascript
const initialState = { count: 0 };

function reducer(state, action) {
  switch (action.type) {
    case 'increment':
      return { count: state.count + 1 };
    case 'decrement':
      return { count: state.count - 1 };
    default:
      throw new Error();
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
