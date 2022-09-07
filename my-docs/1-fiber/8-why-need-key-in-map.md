# React18 源码解析之 key 的作用

> 我们解析的源码是 React18.1.0 版本，请注意版本号。React 源码学习的 GitHub 仓库地址：[https://github.com/wenzi0github/react](https://github.com/wenzi0github/react)。

在阅读过 [React18 源码解析之 diff 对比的过程](https://www.xiabingbao.com) 文章后，我们就会知道，属性 key 相当于某元素的唯一标识，当组件中产生需要 diff 对比元素时，首先要对比的就是属性 key。

React 中并不知道哪个节点产生了修改、新增或者其他变动，都是 key 和 type 来对比前后两个节点才会知道。 当 key 不一样时（如相同索引的位置，current 的 key 是 abc，而 element 中的 key 是 def），或者找不到相应的 key（如 element 中的 key 是 def，但原 current 树中没有该 key），都会把之前的 fiber 节点删除掉，重新创建新的 fiber 节点。

那就会引申出几个问题：

1. 最好不要使用随机数做为 key；
2. 最好不要使用数组的下标做为 key；

## 1. 为什么不能用随机数做 key？

我们在之前的文章讲解过 `updateSlot()` 方法，在 diff 对比过程中，当 key 或 type 不一样时，都会直接舍弃掉之前的 fiber 节点及所有的子节点（即使子节点没有变动），然后重新创建出新的 fiber 节点。

通过随机数设定的 key，则会产生无序性，可能会导致所有的 key 都匹配不上，然后舍弃掉之前所有构建出来的 fiber 节点，再重新创建新的节点。

点击查看样例：[React 中不同的 key 产生的影响](https://www.xiabingbao.com/demos/react-key-rgwxi3.html)。

1. key 的类型选择“随机数”；
2. 可以任意点击“最前新增”或“后面新增”两个按钮，添加元素；
3. 在输入框中输入任意字符，目前输入框是非受控组件；
4. 再次点击任意两个按钮，观察效果；

我们在输入框中输入任意的字符，然后再新增 item 时，输入框中的数据就会被情况。

这是因为，React 中前后两个 key 进行对比时，没有匹配上，然后就会丢弃之前的 fiber 节点，重新创建。同时 input 目前是非受控组件，所有的数据在重新创建后都会丢失。

我们稍微了解下什么是受控组件和非受控组件：

- 受控组件：只能通过 React 修改数据或状态的组件，就是受控组件；
- 非受控组件：与受控组件相反，如 input, textarea, select 等组件，用户也可以控制展示的数据，这就是非受控组件；

我们可以通过一定的方式将非受控组件，改为受控组件，如：

```javascript
const App = () => {
  const [value, setValue] = useState('');

  const handleInput = event => {
    setValue(event.target.value);
  };
  return <input value={value} onInput={handleInput} />;
};
```

监听输入框 input 的 onInput 事件，通过 React 来修改 input 的值。

## 2. 为什么不要使用数组的下标做为 key？

数组下标相对随机数来说，比较稳定一些。但数组下标对应的组件并不是一成不变的，只要在数组的前面或者中间插入元素时，该下标对应的元素就发生变化。

例如数组 list，初始时是['abc']，那么下标 0 对应的就是字符串 abc 元素。然后在最前面插入数字 123，变成[123, 'abc']，此时下标 0 对应的就是数组 123 了。

虽然 key 没变，但对应的元素已经发生变化了。

点击查看样例：[React 中不同的 key 产生的影响](https://www.xiabingbao.com/demos/react-key-rgwxi3.html)。

1. key 的类型选择“数组下标”；
2. 点击“最前新增”按钮，添加元素；
3. 在任意输入框中输入任意字符（这里我们可以选择最上面的那个），目前输入框是非受控组件；
4. 再次点击“最前新增”按钮，观察效果；

可以看到，本来带有内容的输入框应该跟着一起向下移动的，可是他却一直在最上面。因为 key 没有变化，input 节点就会复用上一次渲染的。

## 3. 为什么是最好不要使用？

为什么是“最好不要”使用，而不是坚决不能使用。因为有些情况下是可以用随机数和下标做为 key 的。比如只有则初始时渲染一次，后续不再更新列表，只是对某个具体元素进行更新或事件的处理等。

参考文章：

- [列表 & Key](https://zh-hans.reactjs.org/docs/lists-and-keys.html)
