# React18 源码解析之beginWork的操作

> 我们解析的源码是 React18.1.0 版本，请注意版本号。React 源码学习的 GitHub 仓库地址：[https://github.com/wenzi0github/react](https://github.com/wenzi0github/react)。

beginWork()函数根据不同的节点类型（如函数组件、类组件、html标签、树的根节点等），调用不同的函数来处理，将该fiber节点中带有的element结构解析成fiber节点。我们第一次调用时，unitOfWork（即workInProgress）最初指向的就是树的根节点，这个根节点的类型`tag`是：HostRoot。

根据不同的fiber节点属性，携带的不同的element结构，处理方式也是不一样的。

1. HostRoot类型的，即树的根节点类型的，会把 workInProgress.updateQueue.shared.pending对应的环形链表中element结构，放到 workInProgress.updateQueue.firstBaseUpdate 里，等待后续的执行；
2. FunctionComponent 类型，即函数组件的，会执行这个函数，返回的结果就是element结构；
3. ClassComponent类型的，即类组件的，会得到这个类的实例，然后执行render()方法，返回的结构就是element结构；
4. HostComponent类型的，即html标签类型的，通过`children`属性，即可得到；

上面不同类型的fiber节点都得到了element结构，但将element转为fiber节点时，调用的方式也不一样，如转为文本节点、普通div节点、element为数组转为系列节点、或者elemen转为FunctionComponent类型的节点等等。

beginWork()处理完当前fiber节点的element结构后，就会到一个这个element对应的新的fiber节点（若element是数组的话，则得到的是fiber链表结构的头节点），workInProgress 再指向到这个新的fiber节点（workInProgress = next），继续处理。若没有子节点了，workInProgress就会指向其兄弟元素；若所有的兄弟元素也都处理完了，就返回到其父级节点，查看父级是否有兄弟节点。
