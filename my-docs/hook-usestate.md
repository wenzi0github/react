# useState的执行流程

> 本文是边学习变记录的，有很多不妥和错误之处，请谨慎阅读。

所有的hook都会分成mount和update两个阶段，useState也不例外。hook文件在[ReactFiberHooks.old.js](https://github.com/wenzi0github/react/blob/e82bc5ac1f393c05eda5c4c1f7167c3c37bf072e/packages/react-reconciler/src/ReactFiberHooks.old.js) ,这里我们只讲解useState。

[useState的流程图](https://docs.qq.com/flowchart/DS2F0dGFIVU1ieWda?u=7314a95fb28d4269b44c0026faa673b7)

我们在使用useState时，通常会得到两个值，一个是用于在jsx渲染使用，一个是set方法，用于修改该值。

```jsx
function App() {
  const [count, setCount] = useState(1);
  
  const handleClick = () => {
    setCount(count + 1);
    // setCount(count => count + 1);
  };
  
  return (<div onClick={handleClick}>
    count: {count}
  </div>);
}
```

useState初始化时和调用setCount时，都可以传入两个格式，一种格式是初始值，另一种格式是函数。通过源码中对useState的定义我们就能看得出来：

```javascript
function useState<S>(
  initialState: (() => S) | S,
): [S, Dispatch<BasicStateAction<S>>] {}
```

```mermaid
graph TD;
  A-->B;
  A-->C;
  B-->D;
  C-->D;
```

## mount 阶段

入口函数为`mountState`。

## update 阶段
