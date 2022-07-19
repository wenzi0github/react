# useEffect与setTimeout之间的问题

如：

```javascript
const App = () => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    setCount(count + 1);
    setTimeout(() => {
      console.log('count', count); // 请问这里输出的是几
    }, 500);
  }, []);

  return null;
};
```

这里跟闭包有关系
