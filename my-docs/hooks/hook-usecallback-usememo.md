# useCallback和useMemo的执行流程

useCallback和useMemo的流程相对来说比较简单，他只是根据依赖项存储数据，但并不会直接导致React组件的刷新。

同理，useCallback和useMemo两个hook也分成了mount和update两个阶段。

## useCallback

useCallback的作用，主要是为了缓存方法，避免重新声明，而且还可以根据依赖项重新进行定义。

### mountCallback

初始化时很简单，就是把传入的callback和依赖项deps存储起来。

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

### updateCallback

当React组件重新渲染时，即执行updateCallback。内部会对前后两次的依赖项进行判断，若依赖项没有变化，则返回之前存储的callback；若没有依赖项，或者依赖项发生了变化，则缓存新的callback，并返回该callback。

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
  const prevState = hook.memoizedState;
  if (prevState !== null) {
    if (nextDeps !== null) {
      const prevDeps: Array<mixed> | null = prevState[1];
      if (areHookInputsEqual(nextDeps, prevDeps)) {
        // 若依赖项没有变化，则返回之前存储的callback
        return prevState[0];
      }
    }
  }
  // 若依赖项有变化，或者没有依赖项，则重新存储callback和依赖项
  hook.memoizedState = [callback, nextDeps];
  return callback;
}
```

areHookInputsEqual()方法是用来比较两个数组中的每一项是否相等，我们稍后会单独进行讲解，不过其实也不难，每一项都是用`Object.is`来检测，只要有一项不相等，则返回false；最终全部都一样，就返回true。

## useMemo

useMemo是用来根据依赖项缓存callback计算出的结果，若依赖项没有变化，则一直使用之前计算出来的结果，否则重新进行计算并重新缓存。

useMemo跟useCallback的构成和执行和相似，只不过useMemo会执行传入的callback()，存储的是该callback()执行后的结果。

### mountMemo

useMemo的创建。

```javascript
/**
 * useMemo的创建
 * @param nextCreate
 * @param deps 依赖项
 * @returns {T}
 */
function mountMemo<T>(
  nextCreate: () => T,
  deps: Array<mixed> | void | null,
): T {
  const hook = mountWorkInProgressHook();
  const nextDeps = deps === undefined ? null : deps;
  const nextValue = nextCreate(); // 计算useMemo里callback的返回值
  hook.memoizedState = [nextValue, nextDeps]; // 将返回值和依赖项进行存储
  return nextValue;
}
```

### updateMemo

```javascript
/**
 * useMemo的更新
 * @param nextCreate
 * @param deps
 * @returns {T|*}
 */
function updateMemo<T>(
  nextCreate: () => T,
  deps: Array<mixed> | void | null,
): T {
  const hook = updateWorkInProgressHook();
  const nextDeps = deps === undefined ? null : deps;
  const prevState = hook.memoizedState;
  if (prevState !== null) {
    // Assume these are defined. If they're not, areHookInputsEqual will warn.
    if (nextDeps !== null) {
      const prevDeps: Array<mixed> | null = prevState[1];
      if (areHookInputsEqual(nextDeps, prevDeps)) {
        // 若依赖项没有变化，则返回之前得到的结果
        return prevState[0];
      }
    }
  }
  // 重新计算callback的结果，并进行存储
  const nextValue = nextCreate();
  hook.memoizedState = [nextValue, nextDeps];
  return nextValue;
}
```

