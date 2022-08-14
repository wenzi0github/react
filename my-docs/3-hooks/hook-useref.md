# useRef 的执行流程

useRef() 的流程相对来说简单很多，他只是单纯的在全局存储数据，不会引起 React 组件的刷新。

useRef() 也分成了 mountRef()和 updateRef()两个方法。

## mountRef

初始化。

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

## updateRef

React 组件每次更新时，直接获取 ref 的值即可：

```javascript
function updateRef<T>(initialValue: T): {| current: T |} {
  const hook = updateWorkInProgressHook();
  return hook.memoizedState;
}
```

## 什么时候用 useRef

修改 ref 中的值时，与其他的 hook 不一样，这里直接修改 current 属性的值即可。

```javascript
const numRef = useRef(0);

console.log(numRef.current); // 读取ref中的值
numRef.current = 1; // 设置ref的值
```

那什么时候用`useRef()`呢？凡是修改数据不用页面重新渲染的，都可以使用这个 hook。

例如在一个拖拽的场景里，首先要记录下鼠标按下的坐标，然后再根据移动中的坐标，移动相应的元素。那么记录鼠标初始坐标这件事儿，就用`useRef()`就可以了，因为我们只是单纯地记录该值而已，获取鼠标初始坐标，并不需要引起页面的重绘。
