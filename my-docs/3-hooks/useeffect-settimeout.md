# useEffect 与 定时器之间的问题

如：

```javascript
const App = () => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    setCount(count + 1);
    console.log(count);
    setTimeout(() => {
      console.log("count", count); // 请问这里输出的是几
    }, 500);
  }, []);

  return null;
};
```

这里跟闭包有关系

```javascript
const App = () => {
  const [count, setCount] = useState(0);

  console.log("count", count);

  useEffect(() => {
    const timer = setInterval(() => {
      setCount(count + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return null;
};
```
