hooks的多次调用，如：

```javascript
const [count, setCount] = useState(0);

setCount(count+1);
setCount(count+1);
setCount(count+1);
```
