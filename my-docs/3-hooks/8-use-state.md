# React18 源码解析之 useState 的原理

> 我们解析的源码是 React18.1.0 版本，请注意版本号。React 源码学习的 GitHub 仓库地址：[https://github.com/wenzi0github/react](https://github.com/wenzi0github/react)。

这个往后放一放，要讲解 useState()，得先了解 useReducer()。

大纲：

1. useState()的用法；注意，setState()不会自动合并参数；
2. 若写了多次的 setState()，内部怎么决定哪些可以执行，哪些不执行，是否每一次的调用，都要重新执行一次函数组件？
3. 为什么不能直接修改 state？
4. 源码
5. 不同方式的传参，有什么区别？
6. 常见的几个问题
   1. useState 是同步的还是异步的？有没有办法可以同步执行？
   2. setInterval() + useState() 产生什么现象，为什么会这样？
   3. 同时执行多次 setState(count + 1)和 setState(count => count +1)，结果是否一样，原因是什么？
   4. 若 useState()是基于 props 初始化的，那 props 发生变化时，对应的 useState()会重新执行吗？

`useState()`是我们最常见的几个 hooks 之一，今天我们来了解下他的用法和源码 shixian。

## 1. useState 的使用

我们先来 useState() 的用法，我们知道 setState()的参数，既可以传入普通数据，也可以传入 callback：

```javascript
import { useState } from 'react';

function App() {
  const [count, setCount] = useState(0);
  const [userInfo, setUserInfo] = useState({ name: 'wenzi', age: 24 });

  const handleClickByVal = () => {
    setCount(count + 1);
  };
  const handleClickByCallback = () => {
    setCount(count => count + 1);
  };
  const handleUpdateUserInfo = () => {
    setCount({ ...userInfo, age: userInfo.age + 1 });
  };

  return (
    <div className="App">
      <p>{count}</p>
      <p>
        <button onClick={handleClickByVal}>add by val</button>
      </p>
      <p>
        <button onClick={handleClickByCallback}>add by callback</button>
      </p>
      <p>
        <button onClick={handleUpdateUserInfo}>update userInfo</button>
      </p>
    </div>
  );
}
```

同时，useState()还有如下的几个特点：

1. setState()的参数，既可以传入普通数据，也可以传入 callback；在以 callback 的方式传入时，callback 里的参数就是当前最新的那个 state；
2. 传入的数据并不会自动和之前的进行合并，如上面的`userInfo`，我们需要手动合并后，再调用 set 方法；

### 1.1 传参的区别

useState()在初始时，或调用 setState()时，都有两种传参方式：一种是直接传入数据；一种是以函数的形式传入，state 的值就是该函数的执行结果。

```javascript
function App() {
  // 初始时传入一个callback，现在count的值就是他的返回值，即 Date.now()
  const [count, setCount] = useState(() => {
    return Date.now();
  });
}
```

这里我们主要关注的是多次调用 setState()时，不同的传参方式，他使用的 state 是不一样的。如

直接使用变量：

```javascript
// 直接使用变量
function AppData() {
  const [count, setCount] = useState(0);

  const handleClick = () => {
    setCount(count + 1);
    setCount(count + 1);
    setCount(count + 1);
  };

  return (
    <div className="App">
      <button onClick={handleClick}>click me, {count}</button>
    </div>
  );
}
```

使用 callback 中的变量：

```javascript
// 使用callback中的变量
function AppCallback() {
  const [count, setCount] = useState(0);

  const handleClick = () => {
    setCount(count => count + 1);
    setCount(count => count + 1);
    setCount(count => count + 1);
  };

  return (
    <div className="App">
      <button onClick={handleClick}>click me, {count}</button>
    </div>
  );
}
```

点击一次按钮后，这两个组件最终展示的 count 值是不一样的，`<AppData />` 中展示的是 1，`<AppCallback />`中展示的是 3。

为什么会出现这种现象呢？这是因为，在执行`setCount(count + 1)`时，变量 count 在函数组件的当前生命周期内，它永远是 0，因此即使调用再多的次数也没用。而`setCount(count => count + 1)`则不一样，callback 中的 prevState 则是执行到当前语句之前最新的那个 state。因此在执行第 2 条语句前，count 已经变成了 1；同理第 3 条语句。

我们稍后会从源码的层面分析下这种现象。

### 1.2 object 类型的数据不能自动合并

之前在类组件中的 state，我们可以只传入需要改动的字段，React 会帮助我们合并：

```javascript
class App {
  state = {
    name: 'wenzi',
    age: 24,
  };

  handleClick() {
    this.setState({ age: this.state.age + 1 }); // 只传入有改动的字段即可
  }
}
```

但在函组件的`useState()`中，这里就需要我们自己来合并数据了，然后再传给 setState()。

```javascript
function App() {
  const [userInfo, setUserInfo] = useState({ name: 'wenzi', age: 24 });

  setCount({ ...userInfo, age: userInfo.age + 1 }); // 直接使用state
  setCount(userInfo => ({ ...userInfo, age: userInfo.age + 1 })); // 用callback的方式使用state
}
```

在类组件中，所有的状态都必须挂载在`state`上。在函数组件中，我们可以根据情况进行更细粒度的拆分，如 count 何 userInfo 的拆分；如果觉得 userInfo 不够精细，还可以把其中的 name 和 age 再拆分，单独进行控制。

```javascript
function App() {
  const [name, setName] = useState('wenzi');
  const [age, setAge] = useState(24);
}
```

### 1.3 typescript 的使用

在 typescript 环境中，useState()是支持泛型的，state 的类型默认就是初始数据的类型，如：

```javascript
function App() {
  const [name, setName] = useState('wenzi'); // name 是 string 类型
  const [age, setAge] = useState(24); // age 是 number 类型

  // userInfo 是有多个属性的类型，且已明确了属性，有且只有name和age两个属性，并且这两个属性的类型分别是string和number
  const [userInfo, setUserInfo] = useState({ name: 'wenzi', age: 24 });
}
```

一些相对复杂的数据类型，或者多种数据类型的组合，我们可以显式地设置 state 的类型。

```javascript
enum SEX_TYPE {
  MALE = 0,
  FEMALE = 1,
}

interface UserInfoType {
  name: string;
  age: number;
  score?: number;
}

function App() {
  const [name, setName] = useState<string | null>(null); // name 是 string 类型 或 null，并且初始为null
  const [sex, setSex] = useState<SEX_TYPE>(SEX_TYPE.MALE); // sex是枚举类型

  // 显式地明确 userInfo 的各个属性，score可选
  const [userInfo, setUserInfo] = useState<UserInfoType>({ name: 'wenzi', age: 24 });

  // 更复杂的ts类型
  const [userInfo, setUserInfo] = useState<Pick<UserInfoType, 'name'>>({ name: 'wenzi' });
}
```

在 ts 中，明确各个变量参数的类型，一个原因是为了避免对其随意的赋值，再一个原因，从类型定义上我们就能知道这个变量的具体类型，或他的属性是什么。

## 2. 源码解析
