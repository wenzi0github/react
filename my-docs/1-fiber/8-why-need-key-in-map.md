# React18 源码解析之key的作用

> 我们解析的源码是 React18.1.0 版本，请注意版本号。React 源码学习的 GitHub 仓库地址：[https://github.com/wenzi0github/react](https://github.com/wenzi0github/react)。

在阅读过 [React18 源码解析之 reconcileChildren 的执行](https://www.xiabingbao.com) 文章后，我们就会知道，属性key相当于某元素的唯一标识，当组件中产生需要diff对比元素时，首先要对比的就是属性key。

React中并不知道哪个节点产生了修改、新增或者其他变动，都是key和type来对比前后两个节点才会知道。 当key不一样时（如相同索引的位置，current的key是abc，而element中的key是def），或者找不到相应的key（如element中的key是def，但原current树中没有该key），都会把之前的fiber节点删除掉，重新创建新的fiber节点。

那就会引申出几个问题：

1. 不能使用随机数做为key；
2. 不能使用数组的下标做为key；

## 1. 为什么不能用随机数做key？

例如下面的一段代码：

```javascript

```
