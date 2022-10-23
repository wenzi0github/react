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
   5. useState()为什么要返回一个数组？而不是 Object 类型之类的？

`useState()`是我们最常见的几个 hooks 之一，今天我们来了解下他的用法和源码实现。

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

为什么会出现这种现象呢？这是因为，在执行`setCount(count + 1)`时，变量 count 在函数组件的当前生命周期内，它永远是 0，因此即使调用再多的次数也没用。这里我们简化一下，就方便理解了。

```javascript
function App() {
  const count = 0; // count是一个固定值

  setCount(count + 1);
  setCount(count + 1);
  setCount(count + 1);

  setTimeout(() => {
    setCount(count + 1);
  }, 1000);
}
```

对同一次的渲染来说，count 是一个固定值，无论在哪里使用这个值，都是固定的。`setCount(count+1)`的作用仅仅是把要更新的最新数据记录在了 React 内部，然后等待下次的渲染更新。

而`setCount(count => count + 1)`则不一样，callback 中的 prevState 则是执行到当前语句之前最新的那个 state。因此在执行第 2 条语句前，count 已经变成了 1；同理第 3 条语句。

我们稍后会从源码的层面分析下这种现象。

### 1.2 获取 setState()更新后的值

很多同学在初次使用`useState()`时，经常会在调用 setState()后，马上就使用更新后的数据。

```javascript
function App() {
  const [count, setCount] = useState(0);

  const getList = () => {
    // console.log(count);
    fetch('https://www.xiabingbao.com', {
      method: 'POST',
      body: JSON.stringify({ count }),
    });
  };

  const handleClick = () => {
    setCount(count + 1);
    console.log(count);

    // 本意是想用更新后的最新count来调用 getList()
    getList();
  };
}
```

其实我们通过上面第 1.1 节的了解，已经知道此时输出的 count 还是之间的数值 0。那怎么才能使用最新的数据，来做后续的操作呢？

1. 先计算出最新值，然后同步传给 setCount()和 getList()；
2. 用 useEffect()来监听 count 的变化；

#### 1.2.1 先计算出最新的值

我们可以把更新操作放在前面，先得到结果，然后再同步传给 setCount()和 getList()。

```javascript
const handleClick = () => {
  const newCount = count + 1;
  setCount(newCount);
  getList(newCount);
};
```

这就得要求我们把函数 getList()改造为传参的形式。

#### 1.2.2 用 useEffect()来监听 count 的变化

既然不确定什么时候回拿到最新的值，那我们就监听他的变化，等它了之后再进行后续的请求。

```javascript
function App() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    getList();
  }, [count]);

  const handleClick = () => {
    setCount(count + 1);
  };
}
```

### 1.3 object 类型的数据不能自动合并

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

React 官方更推荐精细化地拆分控制，一方面是控制起来更方便，若 state 比较复杂，那在每次调用 setState()时，都要手动合并数据（当然，您可以自己实现一个自动合并数据的 hook）。另一方面在后期的维护和扩展上更容易，不必考虑其他属性的影响。

### 1.4 typescript 的使用

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

```typescript
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
  const [userInfo, setUserInfo] = useState<Required<Pick<UserInfoType, 'score'>>>({ score: 96 });
}
```

在 ts 中，明确各个变量参数的类型，一个原因是为了避免对其随意的赋值，再一个原因，从类型定义上我们就能知道这个变量的具体类型，或他的属性是什么。

我们在上面已经了解了 useState() 不少的使用方式，这里我们通过源码的角度，来看看为什么出现上面的这些现象。

## 2 hook 的初始挂载

useState() 这个 hook 的大致结构：

![useState() 这个 hook 的大致结构](https://www.xiabingbao.com/upload/5885634448639db4a.png)

在第一次初始声明 useState()，state 的值就是传入的值，若不传入，则是 undefined。我们再来看下 hook 的结构：

```javascript
const hook: Hook = {
  memoizedState: null, // 这个hook目前在函数组件中显示的值，初始时，即为传入的数据（若传入的是函数，则为函数执行后的结果）

  /**
   * 该hook所有的set操作开始执行时的初始值，初始挂载时，该值与 memoizedState 相同；
   * 在中间更新过程中，若存在低优先级的set操作，则 baseState 此时为执行到目前set的值
   **/
  baseState: null,

  /**
   * 执行set操作的链表，这里包含了上次遗留下来的所有set操作，和本次将要执行的所有set操作
   **/
  baseQueue: null,

  // 所有的set操作，都会挂载到 queue.pendig 上
  queue: null,

  // 指向到下一个hook的指针
  next: null,
};
```

注意：我们之前在讲解 hooks 挂载的时候，也讲到过 memoizedState 属性。这两个 memoizedState 属性是不一样的。fiber.memoizedState 是用来挂载 hook 节点链表的；而现在讲解的 hook.memoizedState 是用来挂载该 hook 的数值的。

```javascript
function mountState<S>(initialState: (() => S) | S): [S, Dispatch<BasicStateAction<S>>] {
  /**
   * 创建一个hook节点，并将其挂载到 currentlyRenderingFiber 链表的最后
   * @type {Hook}
   */
  const hook = mountWorkInProgressHook();
  if (typeof initialState === 'function') {
    // 若传入的是函数，则使用执行该函数后得到的结果
    initialState = initialState();
  }
  /**
   * 设置该 hook 的初始值
   * memoizedState 用来存储当前hook要显示的数据
   * baseState 用来存储执行setState()的初始数据
   **/
  hook.memoizedState = hook.baseState = initialState;

  // 为该 hook 添加一个 queue 结构，用来存放所有的 setState() 操作
  const queue = {
    pending: null,
    interleaved: null,
    lanes: NoLanes,
    dispatch: null,
    lastRenderedReducer: basicStateReducer, // 上次render后使用的reducer
    lastRenderedState: initialState, // 上次render后的state
  };
  hook.queue = queue;

  /**
   * 这里用到了 bind() 的偏函数的特性，我们稍后会在下面进行讲解，
   *
   */
  const dispatch = (queue.dispatch = dispatchSetState.bind(null, currentlyRenderingFiber, queue));
  return [hook.memoizedState, dispatch]; // useState() 返回的数据
}
```

mountState()的整体流程：

1. 创建一个 hook 节点，挂载所有初始的数据；
2. 若 initialState 是函数类型，则使用执行它后的结果；
3. 执行当前节点的方法是 basicStateReducer() 函数；这里跟我们后续要讲解的 useReducer() 有关系；
4. 将 hook 节点挂载到函数组件对应的 fiber 节点上；
5. 返回该 hook 的初始值 和 set 方法；

basicStateReducer() 函数的具体实现：

```javascript
/**
 * 对当前的 state 执行的基本操作，若传入的不是函数类型，则直接返回该值，
 * 若传入的是函数类型，返回执行该函数的结果
 * @param {S} state 当前节点的state
 * @param {BasicStateAction<S>} action 接下来要对该state执行的操作
 * @returns {S}
 */
function basicStateReducer(state, action) {
  return typeof action === 'function' ? action(state) : action;
}
```

这个 action 就是我们执行 useState() 里的第 2 个返回值的 set 操作。如：

```javascript
setCount(count + 1); // action 是数值
setCount(count => {
  // action是函数，参数为当前的 count
  console.log('dispatch setCount');
  return count + 1;
});
```

bind()方法可以基于某个函数返回一个新的函数，并且可以为这个新函数预设初始的参数，然后剩余的参数给到这个新函数。官方文档：[bind()的偏函数功能](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Function/bind#%E5%81%8F%E5%87%BD%E6%95%B0)。

我们这里暂时先不管这个函数 dispatchSetState() 的作用是什么，目前只关心参数的传递：

```javascript
function dispatchSetState(fiber: Fiber, queue, action) {}
```

dispatchSetState() 本身要传入 3 个参数的：

1. fiber: 当前处理的 fiber 节点
2. queue: 该 hook 的 queue 结构，用来挂载 setState() 中的操作的；
3. action: 要执行的操作，即 setState(action)里的 action，可能是数据，也可能是函数；

可是我们在执行 `dispatch()`（即 setState()）时只需要传入一个参数就行了，这就是因为源码中利用到了 bind() 的偏函数功能。

再来看下派生出 dispatch() 的操作：

```javascript
/**
 * 这里已经提前把当前的 fiber 节点和 hook 的 queue 结构传进去了，
 * 就只留一个 action 参数给dispatch。
 */
const dispatch = (queue.dispatch = dispatchSetState.bind(null, currentlyRenderingFiber, queue));
```

可以看到，通过 bind()方法，已经提前把当前的 fiber 节点和 hook 的 queue 结构传进去了，就只留一个 action 参数给 dispatch。在调用`dispatch(action时)`，就是在执行`dispatchSetState(fiber, queue, action)`。

如果不太理解的话，我们再看一个简化后的例子：

```javascript
/**
 * 设置学生的某学科的分数
 *
 * @param nick 学生姓名
 * @param subject 学科
 * @param score 分数
 */
const setStudentInfo = (nick, subject, score) => {
  console.log(nick, subject, score);
};

// 设置jack的分数
// 已预设了1个参数，剩余的两个参数供新函数设置
const setJackInfo = setStudentInfo.bind(null, 'Jack');
setJackInfo('math', 89); // Jack math 89
setJackInfo('computer', 92); // Jack computer 92

// 已预设了2个参数，剩余的一个参数供新函数设置
const setTomEnglishScore = setStudentInfo.bind(null, 'Tom', 'english');
setTomEnglishScore(97); // Tom english 97
```

## 3. dispatchSetState

我们使用的 setState()（即源码中的 dispatch）就是 dispatchSetState() 函数派生出来的，执行 useState()的 set 操作，就是执行我们的 dispatchSetState()。

先看下传入的参数：

```javascript
/**
 * 派生一个 setState(action) 方法，并将传入的 action 存放起来
 * 同一个 useState() 的 setState(action) 方法可能会执行多次，这里会把参数里的 action 均会放到queue.pending的链表中
 * @param {Fiber} fiber 当前的fiber节点
 * @param {UpdateQueue<S, A>} queue
 * @param {A} action 即执行setState()传入的数据，可能是数据，也能是方法，setState(1) 或 setState(prevState => prevState+1);
 */
function dispatchSetState<S, A>(fiber: Fiber, queue: UpdateQueue<S, A>, action: A) {}
```

dispatchSetState() 已经让提前传入 fiber 和 queue 的两个参数了，用来表示当前处理的是哪个 fiber 节点，action 的操作放到哪个链表中。这样当执行 useState() 中的 set 方法时，就能直接跟当前的 fiber 节点和当前的 hook 进行绑定。

再看下具体的实现：

```javascript
function dispatchSetState<S, A>(fiber: Fiber, queue: UpdateQueue<S, A>, action: A) {
  /**
   * 获取当前 fiber 更新的优先级，
   * 当前 action 要执行的优先级，就是触发当前fiber更新更新的优先级
   */
  const lane = requestUpdateLane(fiber);

  /**
   * 将 action 操作封装成一个 update节点，用于后续构建链表使用
   */
  const update: Update<S, A> = {
    lane, // 该节点的优先级，即当前fiber的优先级
    action, // 操作，可能直接是数值，也可能是函数
    hasEagerState: false, // 是否是急切状态
    eagerState: null, // 提前计算出结果，便于在render()之前判断是否要触发更新
    next: (null: any), // 指向到下一个节点的指针
  };

  if (isRenderPhaseUpdate(fiber)) {
    /**
     * 是否是渲染阶段的更新，若是，则拼接到 queue.pending 的后面
     */
    enqueueRenderPhaseUpdate(queue, update);
  } else {
    /**
     * 正常执行
     * 将 update 形成单向环形链表，并放到 queue.pending 里
     * 即 hook.queue.pending 里，存放着 update 的数据
     * queue.pending指向到update链表的最后一个元素，next即是第1个元素
     * 示意图： https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/31b3aa9d0f5d4284af1db2c73ea37b9a~tplv-k3u1fbpfcp-zoom-in-crop-mark:1304:0:0:0.awebp
     */
    enqueueUpdate(fiber, queue, update, lane);

    const alternate = fiber.alternate;
    if (fiber.lanes === NoLanes && (alternate === null || alternate.lanes === NoLanes)) {
      /**
       * 当前组件不存在更新，那么首次触发状态更新时，就能立刻计算出最新状态，进而与当前状态比较。
       * 如果两者一致，则省去了后续render的过程。
       * 可以直接执行当前的action，用来提前判断是否需要当前的函数组件fiber节点
       * 若新的state与现在的state一样，我们可以直接提前退出，
       * 若不相同，则标记该fiber节点是需要更新的；同时计算后的state可以直接用于后面的更新流程，不用再重新计算一次。
       * 根据这文档， https://www.51cto.com/article/703718.html
       * 比如从0更新到1，此后每次的更新都是1，即使是相同的值，也会再次重新渲染一次，因为两棵树上的fiber节点，
       * 在一次更新后，只会有一个fiber节点会消除更新标记，
       * 再更新一次，另一个对应的节点才会消除更新标记；再下一次，就会进入到当前的流程，然后直接return
       */
      const lastRenderedReducer = queue.lastRenderedReducer; // 上次render后的reducer，在mount时即 basicStateReducer
      if (lastRenderedReducer !== null) {
        let prevDispatcher;

        const currentState: S = (queue.lastRenderedState: any); // 上次render后的state，mount时为传入的initialState
        const eagerState = lastRenderedReducer(currentState, action);

        update.hasEagerState = true; // 表示该节点的数据已计算过了
        update.eagerState = eagerState; // 存储计算出来后的数据
        if (is(eagerState, currentState)) {
          // 若这次得到的state与上次的一样，则不再重新渲染
          return;
        }
      }
    }

    const eventTime = requestEventTime();

    /**
     * 将当前的优先级lane和触发时间给到 fiber 和 fiber.alternate，
     * 并以 fiber 的父级节点往上到root所有的节点，将 lane 添加他们的 childLanes 属性中，表示该节点的子节点有更新，
     * 在 commit 阶段就会更新该 fiber 节点
     * 这里面还存在一个任务优先级的调度，我们暂时先不考虑
     */
    const root = scheduleUpdateOnFiber(fiber, lane, eventTime);
    if (root !== null) {
      entangleTransitionUpdate(root, queue, lane);
    }
  }

  markUpdateInDevTools(fiber, lane, action);
}
```

dispatchSetState()函数主要是做 3 件事情：

1. 把所有执行的 setState(action) 里的参数 action，全部挂载到链表中；
2. 若之前没有更新（比如第一次渲染后的更新等），马上计算出新的 state，然后与之前的 state 对比，若没有更新，则直接退出；
3. 若有更新，则标记该 fiber 节点及所有的父级节点；刚才计算出的新的 state 可以在接下来的更新中使用；

action 通过 update 节点挂载到链表上后：

![action挂载到queue上的循环链表](https://www.xiabingbao.com/upload/369363502befebae2.jpg)

关于为什么要构建循环链表，如何构建循环链表，请参考[React18 中的循环链表](https://www.xiabingbao.com)，先埋坑，后续补充。

注意，scheduleUpdateOnFiber()函数，仅仅是用来标记该 fiber 有更新需要处理，而并不会立刻重新执行函数组件。

## 4. updateState

当函数组件二次渲染时，可能会进入到 updateState() 里的逻辑。而 updateState() 实际上执行的是 updateReducer()。

```javascript
/**
 * useState()的更新阶段
 * 传入要更新的值initialState，并返回新的[state, setState]
 * @param initialState
 * @returns {[(*|S), Dispatch<S>]}
 */
function updateState<S>(initialState: (() => S) | S): [S, Dispatch<BasicStateAction<S>>] {
  return updateReducer(basicStateReducer, (initialState: any));
}
```

这也说明了 updateState() 和 updateReducer() 执行的逻辑是一样的，只不过 updateState 指定了第 1 个参数，为 basicStateReducer()。这里我们暂时不展开对 useReducer() 的 hook 的讲解。

## 5. updateReducer

在 updateReducer() 中，很大一部分的内容是用来对不同优先级的 set 的调度，和任务链表的拼接。

因为对同一个 useState() 的 hook 来讲，不是所有的 set 操作都要同时一起执行的。比如有的在异步的数据请求后才执行的，有的是放在定时器中执行的。React 会根据不同的优先级，来挑选出当前符合优先级的任务来执行。那么也就会有优先级不足的任务留到下次的渲染时执行。

updateReducer() 的代码比较长，我们主要分为三部分来讲解:

1. 把上次遗留下来的低优先级任务与当前的任务拼接（这里不对当前任务进行优先级的区分，会在第 2 步进行区分）到 baseQueue 属性上；
2. 遍历 baseQueue 属性上所有的任务，若符合当前优先级的，则执行该 update 节点；若不符合，则将此节点到最后的所有节点都存储起来，便于下次渲染遍历，并将到此刻计算出的 state 作为下次更新时的基准 state（在 React 内部，下次渲染的初始 state，可能并不是当前页面展示的那个 state，只有所有的任务都满足优先级完成执行后，两者才是一样的）；
3. 遍历完所有可以执行的任务后，得到一个新的 newState，然后判断与之前的 state 是否一样，若不一样，则标记该 fiber 节点需要更新，并返回新的 newState 和 dispatch 方法。

直接看源码：

```javascript
console.log(1);
```
