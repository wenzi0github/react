# React18 源码解析之 useRef

> 我们解析的源码是 React18.1.0 版本，请注意版本号。React 源码学习的 GitHub 仓库地址：[https://github.com/wenzi0github/react](https://github.com/wenzi0github/react)。

useRef()这个 hook，可以用来存储任何类型的数据。注意，我们这里讲的是 `useRef()`，他是一个 hook，不是 React 组件上的`ref`属性。

## 1. 它的用法

我们先来了解下 useRef() 这个 hook 的简单用法。

```javascript
function App() {
  const domRef = useRef(null); // 存储dom元素
  const startMovePointRef = useRef({ x: -1, y: -1 }); // 在移动场景中，存储开始移动时的坐标

  // 按下鼠标时，记录下坐标
  const handleMouseDown = event => {
    startMovePointRef.current = {
      x: event.clientX,
      y: event.clientY,
    };
  };

  return <div ref={domRef} onMouseDown={handleMouseDown}></div>;
}

function useInterval(callback, delay) {
  const callbackRef = useRef();

  useEffect(() => {
    callbackRef.current = callback;
  });
}
```

从上面的几个例子中可以看到，useRef()中可以用来存储任何类型的数据，比如 dom 元素，object 类型，回调函数等。甚至连`new Map()`也可以存储。

用 `useState()` 这个 hook 也能起到存储数据的效果呀，这两个 hook 有什么区别呢？

## 2. useRef()的特性

这个 hook 的主要特点有：

1. 可以存储任何类型的数据；
2. 存储的数据，在组件的整个生命周期内都有效，而且只在生命周期内有效，组件被销毁后，存储的数据也就被销毁了；
3. 内容被修改时，不会引起组件的重新渲染；
4. 内容被修改，是会立即生效的；
5. 内容的读写操作，都是在 current 属性上操作的，没有额外的 get, set 等方法；

知道 useRef() 这个 hook 的几个特点后，我们再对比下 useState() 和 全局变量的区别。

|                      | useRef()               | useState()             | 全局变量           |
| -------------------- | ---------------------- | ---------------------- | ------------------ |
| 存储的数据类型       | 全部                   | 全部                   | 全部               |
| 数据的生命周期       | 当前所在组件的生命周期 | 当前所在组件的生命周期 | 整个项目的生命周期 |
| 组件被多次引用时     | 每个数据都是独立的     | 每个数据都是独立的     | 共享该数据         |
| 是否引起组件重新渲染 | 否                     | 是                     | 否                 |
| 是否立即生效         | 下次渲染时生效         | 立即生效               | 立即生效           |

因此，若要存储的一些数据，没必要渲染到视图中的数据，可以存储到`useRef()`中。比如上面样例中的回调函数 callback，DOM 元素，一些坐标数据等等。

## 3. 源码

我们在文章[React18 源码解析之 hooks 的挂载](https://www.xiabingbao.com/post/react/react-hooks-rjp9x1.html)中也知道，所有的 hooks 的使用，氛围初始创建和更新两个阶段。

### 3.1 初始创建阶段

useRef() 内部的实现比较简单，我们直接看源码：

```javascript
function mountRef<T>(initialValue: T): {| current: T |} {
  // 创建一个hook，并将其放到hook链表中
  const hook = mountWorkInProgressHook();

  // 存储数据，并返回这个数据
  const ref = { current: initialValue };
  hook.memoizedState = ref;
  return ref;
}
```

可以看到，不管什么类型的数据，都是放在 object 类型中的 current 属性上，然后存储到 hook 节点的 memoizedState 中。这个 hook 并不会引起其他的行为（如组件的二次渲染等），只是单纯的存储数据。

### 3.2 更新阶段

源码：

```javascript
function updateRef<T>(initialValue: T): {| current: T |} {
  const hook = updateWorkInProgressHook();
  return hook.memoizedState;
}
```

更新阶段的源码也很简单，直接返回 hook 节点上 memoizedState 属性的内容。

综合上面初始创建和更新两个阶段的源码，我们也知道，想要在`useRef()`上存储或使用数据时，都是在`.current`属性上操作。

## 4. 总结

了解完 useRef() 的源码后，我们再回头看他的特性时，就能更好地理解了。

1. 可以存储任何类型的数据；
2. 存储的数据，在组件的整个生命周期内都有效，而且只在生命周期内有效，组件被销毁后，存储的数据也就被销毁了；
3. 内容被修改时，不会引起组件的重新渲染；
4. 内容被修改，是会立即生效的；
5. 内容的读写操作，都是在 current 属性上操作的，没有额外的 get, set 等方法；

在官方上，有段关于 [useRef()](https://reactjs.org/docs/hooks-reference.html#useref) 的介绍，这里摘抄一下：

> 它（useRef()）创建的是一个普通 Javascript 对象。而 `useRef()` 和自建一个 `{current: ...}` 对象的唯一区别是，useRef 会在每次渲染时返回同一个 ref 对象。
>
> 请记住，当 ref 对象内容发生变化时，`useRef` 并不会通知你。变更 `.current` 属性不会引发组件重新渲染。如果想要在 React 绑定或解绑 DOM 节点的 ref 时运行某些代码，则需要使用回调 ref 来实现
