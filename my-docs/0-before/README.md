# 前期准备工作

我们在阅读React源码之前，先熟悉几个概念，这样读起来会顺畅很多。

## 1. 什么是jsx

我们在React中写的类似于html的结构就被称为JSX，但他并不是html，而是一个JavaScript的语法扩展。即他是js，而不是html。

官方文档：
* [JSX 简介](https://zh-hans.reactjs.org/docs/introducing-jsx.html)
* [深入 JSX](https://zh-hans.reactjs.org/docs/jsx-in-depth.html)

```jsx
const App = () => {
  const handleClick = () => {
    console.log('click');
  };
  
  return (<div onClick={handleClick}>
    <p>hello world</p>
  </div>);
};
```

这里我们不讲解jsx的使用方式，主要说下JSX的作用。jsx是js的语法糖，方便我们开发者的维护。最后实际上会被React(React16.x及之前)或babel编译(React17.0及更新)成用createElement编译的结构。

上面的jsx结构会被编译成：

```javascript
createElement('div', { onClick: handleClick },
  createElement('p', null, 'hello world')
)
```

## 2. createElement是用来干嘛的

## 3. fiber结构
