# React18 源码解析之 useCallback 和 useMemo

> 我们解析的源码是 React18.1.0 版本，请注意版本号。React 源码学习的 GitHub 仓库地址：[https://github.com/wenzi0github/react](https://github.com/wenzi0github/react)。

React 中有两个 hooks 可以用来缓存函数和变量，提高性能，减少资源浪费。那什么时候会用到 useCallback 和 useMemo 呢？

## 1. 使用场景

useCallback 和 useMemo 的使用场景稍微有点不一样，我们分开来说明。

### 1.1 useCallback

我们知道 useCallback 可以缓存函数体，在依赖项没有变化时，前后两次渲染时，使用的函数体是一样的。

很多同学觉得用 useCallback 包括函数，可以减少函数创建的开销 和 gc。但实际上，现在 js 在执行一些闭包或其他内联函数时，运行非常快，性能非常快。若不恰当的使用 useCallback 包括一些函数，可能还会**适得其反**，因为 React 内部还需要创建额外的空间来缓存这些函数体，并且还要监听依赖项的变化。

如下面的这种方式其实就很没有必要：

```javascript
function App() {
  // 没必要
  const handleClick = useCallback(() => {
    console.log(Date.now());
  }, []);

  return <button onClick={handleClick}>click me</button>;
}
```

那 useCallback 在什么场景下会用到呢？

- 函数作为其他 hook 的依赖项时（如在 useEffect()中）；
- 函数作为 React.memo()（或 shouldComponentUpdate ）中的组件的 props；

我们来一一看下。

#### 1.1.1 作为其他 hook 的依赖项

我们经常会有请求数据的场景，然后在 `useEffect()` 中触发：

```javascript
function App() {
  const [state, setState] = useState();
  const requestData = async () => {
    // fetch
    setState();
  };
  useEffect(() => {
    requestData();
  }, []);
}
```

我们在官方脚手架 `create-react-app` 写这段代码时，他就会给出提示，大致意思是 useEffect 使用了外部的变量，需要将其添加到依赖中，即：

```javascript
useEffect(() => {
  requestData();
}, [requestData]); // 将 requestData 添加到依赖项中
```

如若只是把它添加到依赖项中，再执行代码时，会发现代码陷入了无限循环。这是因为函数 requestData() 在每次 render()时，都是重新定义的，导致依赖项发生了变化，就会执行里面的 requestData()，进而触发 setState()进行下次的渲染，陷入无限循环。

为什么明明是同一个函数体，两个变量却不一样呢？比如下面的这个例子：

```javascript
const funcA = () => {
  console.log('www.xiabingbao.com');
};
const funcB = () => {
  console.log('www.xiabingbao.com');
};

console.log(funcA === funcB); // false
```

他们的函数体仅仅是看起来是一样的，但实际上是完全独立的两个个体。上面的 requestData()同理，每次都是重新声明一个新的，跟之前的函数肯定就不一样了。

这个时候，我们就需要把 requestData()用`useCallback()`包裹起来：

```javascript
const requestData = useCallback(async () => {
  // fetch
  setState();
}, []);
```

这就能保证函数 requestData()在多次渲染过程中是一致的（除非依赖项发生变化）。

#### 1.1.2 作为 React.memo()等组件的 props；

有一些我们是需要向子组件传入回调函数的场景，比如 onClick, onSuccess, onClose 等。

```javascript
function Count({ onClick }) {
  const [count, setCount] = useState(count);

  const handleClick = () => {
    const nextCount = count + 1;
    setCount(nextCount);
    onClick(nextCount);
  };

  console.log('Count render', Date.now());

  return <button onClick={handleClick}>click me</button>;
}

function App() {
  const [now, setNow] = useState(0);
  const handleClick = count => {
    console.log('App count', count);
  };

  return (
    <div>
      <p>
        <button onClick={() => setNow(Date.now())}>set new time</button>
      </p>
      <Count onClick={handleClick} />
    </div>
  );
}
```

函数组件 `<App />` 中的 handleClick 传给了子组件 `<Count />`，当父级组件触发更新时，子组件也会执行，只不过 state 没有变化而已。那么如何避免子组件必须要的刷新呢？这里我们就需要用到 `React.memo` 了（注意，这里不是 useMemo()）。

> React.memo()可接受 2 个参数，第一个参数为纯函数的组件；第二个参数是 compare(prevProps, nextProps)函数（可选），用于自行实现功能，对比 props ，控制是否刷新。

我们用`React.memo()`包裹住函数组件后，只需要保证传入的 props 不发生变化，那么函数组件就不会二次执行。

```javascript
const MemoCount = React.memo(<Count />);
```

那传入的各种 callback 就得用`useCallback()`来封装了，如上面的 handleClick:

```javascript
const handleClick = useCallback(count => {
  console.log('App count', count);
}, []);
```

### 1.2 useMemo

useMemo() 与 useCallback() 的功能很像，只不过 useMemo 用来缓存函数执行的结果，而 useCallback()用来缓存函数体。

#### 1.2.1 useMemo 的使用

如每次渲染时都要执行一段很复杂的运算，或者一个变量需要依赖另一个变量的运算结果，就都可以使用`useMemo()`。

比如有一个计算百分比的场景：用户可以在某个项目中，捐赠自己的虚拟金币，不过项目接收的虚拟金币有上限，然后实时显示该项目的受捐进度。同时，进度展示这里，还有几个其他的规则：

1. 进度的百分比的数字显示整数，向下取整；
2. 只要有捐助行为，则百分比至少为 1%；
3. 进度不能超过 100%（最后一次的捐赠可能会超过上限）；

在某个组件获取进度百分比的时候，我们这里可以封装到`useMemo()`中，因为进度的百分比只跟当前进度和总上限有关系。

```javascript
const curPercent = useMemo(() => {
  if (progress === 0 || topLimit === 0) {
    return 0;
  }
  const percent = (progress * 100) / topLimit;
  if (percent <= 1) {
    return 1;
  }
  if (percent >= 100) {
    return 100;
  }
  return Math.floor(percent);
}, [progress, topLimit]);
```

若当前进度和总上限没有变化时，则不用重新计算百分比。

#### 1.2.2 其他变体

其实我们可以看到，`useMemo()`类似于 useEffect() 和 useState() 的组合体：

```javascript
const [curPercent, setCurPercent] = useState(0);

useEffect(() => {
  if (progress === 0 || topLimit === 0) {
    setCurPercent(0);
    return;
  }
  const percent = (progress * 100) / topLimit;
  if (percent <= 1) {
    setCurPercent(1);
    return;
  }
  if (percent >= 100) {
    setCurPercent(100);
    return;
  }
  setCurPercent(Math.floor(percent));
}, [progress, topLimit]);
```

相应地，若遇到上面需要用 useEffect 和 useState 实现的场景，就可以直接用`useMemo()`来实现。

而且，useCallback()也是可以用 useMemo()来实现的。因为 useMemo()返回的是函数执行的结果，那我们返回的结果就是一个函数不就行了。

```javascript
const handleClick = useMemo(() => {
  // 返回一个函数
  return () => {
    console.log(Date.now());
  };
}, []);

hanleClick();
```

## 2. 源码

我们了解了 useCallback() 和 useMemo() 的基本用法之后，再来了解下他们源码的实现。

我们在之前 renderWithHooks 的章节中也了解到，所有的 hooks 在内部实现时，都区分了 mount 阶段和 update 阶段，useCallback()和 useMemo() 两个 hooks 也不例外。

### 2.1 useCallback 的源码

useCallback()在 React 内部实现时，分成了 mountCallback()和 updateCallback()。

- mountCallback: 生成 hook 节点，并存储回调函数 callback 和依赖项 deps；
- updateCallback: 新的依赖项与之前存储的依赖项进行对比，若没有变化，则直接返回，否则存储新的回调函数和依赖项；

#### 2.1.1 mountCallback

初始化时很简单，就是把传入的 callback 和依赖项 deps 存储起来。

```javascript
/**
 * useCallback的创建
 * @param callback
 * @param deps
 * @returns {T}
 */
function mountCallback<T>(callback: T, deps: Array<mixed> | void | null): T {
  const hook = mountWorkInProgressHook(); // 创建一个新的hook节点
  const nextDeps = deps === undefined ? null : deps;
  hook.memoizedState = [callback, nextDeps]; // 直接将callback和依赖项进行存储
  return callback;
}
```

可以看到，这里用数组的方式，把 callback 和依赖项存储到了 hook 节点的 memoizedState 属性上，然后返回这个 callback。因此我们执行 useCallback()的返回值就是这个传入 callback。

#### 2.1.2 updateCallback

updateCallback 的实现相对来说，也比较简单，关键点就在于依赖项的对比。

```javascript
/**
 * useCallback的更新
 * @param callback
 * @param deps
 * @returns {T|*}
 */
function updateCallback<T>(callback: T, deps: Array<mixed> | void | null): T {
  const hook = updateWorkInProgressHook();
  const nextDeps = deps === undefined ? null : deps;
  const prevState = hook.memoizedState; // 取出上次存储的数据: [callback, prevDeps]

  // 若之前的数据不为空
  if (prevState !== null) {
    if (nextDeps !== null) {
      /**
       * 若依赖项不为空，且前后两个依赖项没有发生变化时，
       * 则直接返回之前的callback（prevState[0]）；
       * 有个 areHookInputsEqual() 我们先不关心细节，只需要知道是用来对比依赖项的
       */
      const prevDeps: Array<mixed> | null = prevState[1];
      if (areHookInputsEqual(nextDeps, prevDeps)) {
        // 若依赖项没有变化，则返回之前存储的callback
        return prevState[0];
      }
    }
  }

  /**
   * 若依赖项为空，或者依赖项发生了变动，则重新存储callback和依赖项
   * 然后返回最新的callback
   */
  hook.memoizedState = [callback, nextDeps];
  return callback;
}
```

若前后两个依赖项都不为空，且依赖项没有发生变动，则直接返回之前存储的 callback，达到了缓存的目的。

若依赖项为空，或者依赖项发生了变化，则重新存储 callback 和依赖项，然后返回最新的 callback。因此，若不设置依赖项，或者依赖项一直在变，则无法达到缓存的目的。

这里有个工具函数 areHookInputsEqual()，该函数的作用，就是用来对比前后两个依赖项中所有的数据是否发生了变化，只要有一项的数据发生了变化（相同位置前后的两个数据不相等），则认为依赖项产生了变动。

### 2.2 useMemo 的源码

useMemo()的实现，与 useCallback 很相似，只不过在 useMemo()中，执行了 callback，然后缓存的是其返回的结果。

useMemo()在 React 内部实现时，分成了 mountMemo()和 updateMemo()。

- mountMemo: 生成 hook 节点，并存储回调函数 callback **执行的结果**和依赖项 deps；
- updateMemo: 新的依赖项与之前存储的依赖项进行对比，若没有变化，则直接返回，否则存储新的回调函数的**执行结果**和依赖项；

#### 2.2.1 mountMemo

初始节点源码的实现：

```javascript
/**
 * useMemo的创建
 * @param nextCreate
 * @param deps 依赖项
 * @returns {T}
 */
function mountMemo<T>(nextCreate: () => T, deps: Array<mixed> | void | null): T {
  const hook = mountWorkInProgressHook(); // 在链表的末尾创建一个hook节点
  const nextDeps = deps === undefined ? null : deps;

  /**
   * 计算useMemo里callback的返回值
   * 这是与 useCallback() 不同的地方，这里会执行回调函数callback
   */
  const nextValue = nextCreate();
  hook.memoizedState = [nextValue, nextDeps]; // 将返回值和依赖项进行存储
  return nextValue; // 返回执行callback()的返回值
}
```

我们从源码中可以看到，在 mountMemo()里，会执行回调函数 callback()，然后存储该函数的返回结果。

#### 2.2.2 updateMemo

在了解 updateCallback()的源码后，updaeMemo()的源码也很好理解。

```javascript
/**
 * useMemo的更新
 * @param nextCreate
 * @param deps
 * @returns {T|*}
 */
function updateMemo<T>(nextCreate: () => T, deps: Array<mixed> | void | null): T {
  const hook = updateWorkInProgressHook();
  const nextDeps = deps === undefined ? null : deps;
  const prevState = hook.memoizedState;
  if (prevState !== null) {
    // Assume these are defined. If they're not, areHookInputsEqual will warn.
    if (nextDeps !== null) {
      const prevDeps: Array<mixed> | null = prevState[1];
      if (areHookInputsEqual(nextDeps, prevDeps)) {
        // 若依赖项没有变化，则返回之前存储的结果
        return prevState[0];
      }
    }
  }
  // 重新计算callback的返回结果，并进行存储
  const nextValue = nextCreate();
  hook.memoizedState = [nextValue, nextDeps];
  return nextValue;
}
```

当依赖项不为空，且没有变化时，直接返回之前存储的数据；否则执行最新的回调函数，然后存储该函数最新的返回结果，并返回。

## 3. 总结

这是 React 源码内部实现起来比较简单的 hooks，我们先做个开胃菜，后续比如 useState(), useEffect() 等 hooks，整体的逻辑会更加复杂一些。

参考链接：

- [Are Hooks slow because of creating functions in render?](https://reactjs.org/docs/hooks-faq.html#are-hooks-slow-because-of-creating-functions-in-render)
- https://segmentfault.com/a/1190000022651514
- https://zhuanlan.zhihu.com/p/56975681
