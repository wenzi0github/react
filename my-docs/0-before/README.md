# 前期准备工作

> 我们解析的源码是React18.0.2版本，请注意版本号。

我们接下来的文章是进行React源码解析的，已默认您已很熟练使用React，并阅读过[React的官方文档](https://zh-hans.reactjs.org/docs/getting-started.html)。

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

同样的，我们在React中像下面这样写的效果是一样的：

```javascript
createElement('div', { onClick: handleClick },
  createElement('p', null, 'hello world')
)
```

## 2. createElement是用来干嘛的

上面提到会将jsx编译成由createElement()函数组成的一个嵌套结果。那么createElement里具体都干了什么呢？

在React16及之前，createElement()方法是React中的一个方法，因此有些同学就会有疑问，在写`.jsx`的组件时，本来没用到React中的方法，但还是要引入React。就如上面的代码，在React16及之前，要在头部显式地将React import进来。

```jsx
import React from 'react';
```

最终转换出的代码是：

```javascript
React.createElement('div', { onClick: handleClick },
  React.createElement('p', null, 'hello world')
)
```

但从React17开始，若用不到React中的方法，就不用再显式的引入React了。这是因为React和babel合作，将jsx的转换工作放到了编译工具babel中。

新的 JSX 转换不会将 JSX 转换为 React.createElement，而是自动从 React 的 package 中引入新的入口函数并调用。

假设你的源代码如下：

```jsx
function App() {
  return <h1>Hello World</h1>;
}
```

下方是新 JSX 被转换编译后的结果：

```javascript
// 由编译器引入（禁止自己引入！）
import {jsx as _jsx} from 'react/jsx-runtime';

function App() {
  return _jsx('h1', { children: 'Hello world' });
}
```

注意，此时源代码无需引入 React 即可使用 JSX 了！若仍然要使用React提供的Hook等功能，还是需要引入React的。

可以看到新jsx()和之前的React.createElement()方法转换出来的结构稍微有点区别。之前的React.createElement()方法里，子结构会通过第三个参数进行传入；而在jsx()方法中，这里将子结构放到了第二个参数的children字段里，第3个字段则用于传入设置的key属性。若子结构中只有一个子元素，那么children就是一个jsx()，若有多个元素时，则会转为数组：

```javascript
const App = () => {
  return jsx("div", {
    children: jsx("p", {
      children: [
        jsx("span", {
          className: "dd",
          children: "hello world"
        }),
        _jsx("span", {
          children: "123"
        })
      ]
    })
  });
};
```

这里有个babel的在线网站，我们可以编写一段React代码，能实时看到通过babel编译后的效果：[React通过babel实现新的jsx转换](https://babeljs.io/repl/#?browsers=defaults%2C%20not%20ie%2011%2C%20not%20ie_mob%2011&build=&builtIns=false&corejs=3.21&spec=false&loose=false&code_lz=JYWwDg9gTgLgBAJQKYEMDGMAiB5AsnAMyghDgHIpUMBaAExLIG4AoZtCAOwGd4BBMMHAC8cABQBKYQD44Ab2YBISjACuUDmIA8tYADcpzOEbgLNYA8csnNXMCg0BrJAE8hAIhQAjNG6kALJAAbQIg4AHdoQNpNAHpbewsrI1jzQ2NYnX1xFgBfFnZueGIIeBFkdCw8ADo0ShQYJAQIEtF6NBUQJA4YKoBzJBgAUUCkTu6AIWcASVpRCmaYMkkULjgACQAVXAAZYdGumGzmYp7KDlokKFE0zXKMKoBlGChgDFwIC8Tk_kEYxNi7j0ni83h8kAYjkA&debug=false&forceAllTransforms=false&shippedProposals=false&circleciRepo=&evaluate=false&fileSize=false&timeTravel=false&sourceType=module&lineWrap=true&presets=react%2Ctypescript&prettier=false&targets=&version=7.18.5&externalPlugins=&assumptions=%7B%7D)。若jsx的转换方式还是旧版的，请在左侧的配置中，将React Runtime设置为 automatic 。

那么jsx()方法里具体是怎么执行的呢？最后返回了样子的数据呢？源码位置：[jsx()](https://github.com/wenzi0github/react/blob/7a53120fb909084785e4192787bf712f0c0e2ea7/packages/react/src/jsx/ReactJSXElement.js#L241)。

jsx()方法会先进行一系列的判断

相关链接： [介绍全新的 JSX 转换](https://zh-hans.reactjs.org/blog/2020/09/22/introducing-the-new-jsx-transform.html)。

jsx()方法中，会经过一些判断，将key和ref两个比较特殊的属性单独提取出来。

```javascript
/**
 * 将jsx编译为普通的js树形结构
 * @param {string|function} type 若节点为普通html标签时，type为标签的tagName，若为组件时，即为该函数
 * @param {object} config 该节点所有的属性，包括children
 * @param {string?} maybeKey 显式地设置的key属性
 * @returns {*}
 */
export function jsx(type, config, maybeKey) {
  let propName;

  // Reserved names are extracted
  const props = {};

  let key = null;
  let ref = null;

  // Currently, key can be spread in as a prop. This causes a potential
  // issue if key is also explicitly declared (ie. <div {...props} key="Hi" />
  // or <div key="Hi" {...props} /> ). We want to deprecate key spread,
  // but as an intermediary step, we will use jsxDEV for everything except
  // <div {...props} key="Hi" />, because we aren't currently able to tell if
  // key is explicitly declared to be undefined or not.
  // 若设置了key，则使用该key
  if (maybeKey !== undefined) {
    if (__DEV__) {
      checkKeyStringCoercion(maybeKey);
    }
    key = '' + maybeKey;
  }

  // 若config中设置了key，则使用config中的key
  if (hasValidKey(config)) {
    if (__DEV__) {
      checkKeyStringCoercion(config.key);
    }
    key = '' + config.key;
  }

  // 提取设置的ref属性
  if (hasValidRef(config)) {
    ref = config.ref;
  }

  // Remaining properties are added to a new props object
  // 剩余属性将添加到新的props对象中
  for (propName in config) {
    if (
      hasOwnProperty.call(config, propName) &&
      !RESERVED_PROPS.hasOwnProperty(propName)
    ) {
      props[propName] = config[propName];
    }
  }

  /**
   * type可能会有两种格式，一种是普通的html标签，一种是组件
   * 当type是普通的html标签时，为string类型；
   * 当type是组件时，为function类型，而function类型时，是可以添加defaultProps属性的
   * 当设置了defaultProps，则将未明确传入的属性给到props里
   */
  // Resolve default props
  if (type && type.defaultProps) {
    const defaultProps = type.defaultProps;
    for (propName in defaultProps) {
      if (props[propName] === undefined) {
        props[propName] = defaultProps[propName];
      }
    }
  }

  /**
   * 参数处理完成后，就调用ReactElement()方法返回一个object结构
   */
  return ReactElement(
    type,
    key,
    ref,
    undefined,
    undefined,
    ReactCurrentOwner.current,
    props,
  );
}
```

ReactElement()方法的作用就是返回一个object结构，我们这里把所有的提示代码都去掉：

```javascript
/**
 * Factory method to create a new React element. This no longer adheres to
 * the class pattern, so do not use new to call it. Also, instanceof check
 * will not work. Instead test $$typeof field against Symbol.for('react.element') to check
 * if something is a React Element.
 *
 * @param {*} type
 * @param {*} props
 * @param {*} key
 * @param {string|object} ref
 * @param {*} owner
 * @param {*} self A *temporary* helper to detect places where `this` is
 * different from the `owner` when React.createElement is called, so that we
 * can warn. We want to get rid of owner and replace string `ref`s with arrow
 * functions, and as long as `this` and owner are the same, there will be no
 * change in behavior.
 * @param {*} source An annotation object (added by a transpiler or otherwise)
 * indicating filename, line number, and/or other information.
 * @internal
 */
const ReactElement = function(type, key, ref, self, source, owner, props) {
  const element = {
    // This tag allows us to uniquely identify this as a React Element
    $$typeof: REACT_ELEMENT_TYPE,

    // Built-in properties that belong on the element
    type: type,
    key: key,
    ref: ref,
    props: props,

    // Record the component responsible for creating this element.
    _owner: owner,
  };
  
  return element;
};
```

## 3. fiber结构
