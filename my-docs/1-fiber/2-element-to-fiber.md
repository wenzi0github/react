# React18 源码解析之虚拟 DOM 转为 fiber 树

> 我们解析的源码是 React18.1.0 版本，请注意版本号。React 源码学习的 GitHub 仓库地址：[https://github.com/wenzi0github/react](https://github.com/wenzi0github/react)。

我们在文章 [React18 源码解析之 fiber 等数据结构](https://www.xiabingbao.com/post/react/jsx-element-fiber-rfztfs.html) 中讲解了 jsx, element 和 fiber 的基本结构。这里我们主要讲下如何将 jsx 转为 fiber 节点组成的 fiber 树。

我们为便于理解整个转换的过程，会做一些流程上的精简：

1. 大部分只考虑初始渲染阶段，因此诸如副作用的收集等暂时就不考虑了，不过偶尔也会涉及到一点两棵 fiber 树的对比；
2. 忽略各种任务的优先级的调度；
3. React 中各个节点的类型很多，如函数组件、类组件、html 节点、Suspense 类型的组件、使用 lazy()方法的动态组件等等，不过我们这里主要讲解下函数组件、类组件、html 节点这 3 个；

## 0. 起始

在开始讲解前，我们先定义下要渲染的 React 组件，方便我们后续的理解：

```jsx
const FuncComponent = () => {
  return (
    <p>
      <span>this is function component</span>
    </p>
  );
};

class ClassComponent extends React.Component {
  render() {
    return <p>this is class component</p>;
  }
}

function App() {
  return (
    <div className="App">
      <FuncComponent />
      <ClassComponent />
      <div>
        <span>123</span>
      </div>
    </div>
  );
}

const root = document.getElementById('root');
ReactDOM.render(<App />, root);
```

我们编写这个结构要解决的问题：

1. 函数组件、类组件、html 标签这些分别怎么处理；
2. 处理嵌套的、并列的标签，流程是如何流转的；
