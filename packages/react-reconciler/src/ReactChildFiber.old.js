/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {ReactElement} from 'shared/ReactElementType';
import type {ReactPortal} from 'shared/ReactTypes';
import type {Fiber} from './ReactInternalTypes';
import type {Lanes} from './ReactFiberLane.old';

import getComponentNameFromFiber from 'react-reconciler/src/getComponentNameFromFiber';
import {Placement, ChildDeletion, Forked} from './ReactFiberFlags';
import {
  getIteratorFn,
  REACT_ELEMENT_TYPE,
  REACT_FRAGMENT_TYPE,
  REACT_PORTAL_TYPE,
  REACT_LAZY_TYPE,
} from 'shared/ReactSymbols';
import {ClassComponent, HostText, HostPortal, Fragment} from './ReactWorkTags';
import isArray from 'shared/isArray';
import {warnAboutStringRefs} from 'shared/ReactFeatureFlags';
import {checkPropStringCoercion} from 'shared/CheckStringCoercion';

import {
  createWorkInProgress,
  resetWorkInProgress,
  createFiberFromElement,
  createFiberFromFragment,
  createFiberFromText,
  createFiberFromPortal,
} from './ReactFiber.old';
import {emptyRefsObject} from './ReactFiberClassComponent.old';
import {isCompatibleFamilyForHotReloading} from './ReactFiberHotReloading.old';
import {StrictLegacyMode} from './ReactTypeOfMode';
import {getIsHydrating} from './ReactFiberHydrationContext.old';
import {pushTreeFork} from './ReactFiberTreeContext.old';

let didWarnAboutMaps;
let didWarnAboutGenerators;
let didWarnAboutStringRefs;
let ownerHasKeyUseWarning;
let ownerHasFunctionTypeWarning;
let warnForMissingKey = (child: mixed, returnFiber: Fiber) => {};

if (__DEV__) {
  didWarnAboutMaps = false;
  didWarnAboutGenerators = false;
  didWarnAboutStringRefs = {};

  /**
   * Warn if there's no key explicitly set on dynamic arrays of children or
   * object keys are not valid. This allows us to keep track of children between
   * updates.
   */
  ownerHasKeyUseWarning = {};
  ownerHasFunctionTypeWarning = {};

  warnForMissingKey = (child: mixed, returnFiber: Fiber) => {
    if (child === null || typeof child !== 'object') {
      return;
    }
    if (!child._store || child._store.validated || child.key != null) {
      return;
    }

    if (typeof child._store !== 'object') {
      throw new Error(
        'React Component in warnForMissingKey should have a _store. ' +
          'This error is likely caused by a bug in React. Please file an issue.',
      );
    }

    child._store.validated = true;

    const componentName = getComponentNameFromFiber(returnFiber) || 'Component';

    if (ownerHasKeyUseWarning[componentName]) {
      return;
    }
    ownerHasKeyUseWarning[componentName] = true;

    console.error(
      'Each child in a list should have a unique ' +
        '"key" prop. See https://reactjs.org/link/warning-keys for ' +
        'more information.',
    );
  };
}

function coerceRef(
  returnFiber: Fiber,
  current: Fiber | null,
  element: ReactElement,
) {
  const mixedRef = element.ref;
  if (
    mixedRef !== null &&
    typeof mixedRef !== 'function' &&
    typeof mixedRef !== 'object'
  ) {
    if (__DEV__) {
      // TODO: Clean this up once we turn on the string ref warning for
      // everyone, because the strict mode case will no longer be relevant
      if (
        (returnFiber.mode & StrictLegacyMode || warnAboutStringRefs) &&
        // We warn in ReactElement.js if owner and self are equal for string refs
        // because these cannot be automatically converted to an arrow function
        // using a codemod. Therefore, we don't have to warn about string refs again.
        !(
          element._owner &&
          element._self &&
          element._owner.stateNode !== element._self
        )
      ) {
        const componentName =
          getComponentNameFromFiber(returnFiber) || 'Component';
        if (!didWarnAboutStringRefs[componentName]) {
          if (warnAboutStringRefs) {
            console.error(
              'Component "%s" contains the string ref "%s". Support for string refs ' +
                'will be removed in a future major release. We recommend using ' +
                'useRef() or createRef() instead. ' +
                'Learn more about using refs safely here: ' +
                'https://reactjs.org/link/strict-mode-string-ref',
              componentName,
              mixedRef,
            );
          } else {
            console.error(
              'A string ref, "%s", has been found within a strict mode tree. ' +
                'String refs are a source of potential bugs and should be avoided. ' +
                'We recommend using useRef() or createRef() instead. ' +
                'Learn more about using refs safely here: ' +
                'https://reactjs.org/link/strict-mode-string-ref',
              mixedRef,
            );
          }
          didWarnAboutStringRefs[componentName] = true;
        }
      }
    }

    if (element._owner) {
      const owner: ?Fiber = (element._owner: any);
      let inst;
      if (owner) {
        const ownerFiber = ((owner: any): Fiber);

        if (ownerFiber.tag !== ClassComponent) {
          throw new Error(
            'Function components cannot have string refs. ' +
              'We recommend using useRef() instead. ' +
              'Learn more about using refs safely here: ' +
              'https://reactjs.org/link/strict-mode-string-ref',
          );
        }

        inst = ownerFiber.stateNode;
      }

      if (!inst) {
        throw new Error(
          `Missing owner for string ref ${mixedRef}. This error is likely caused by a ` +
            'bug in React. Please file an issue.',
        );
      }
      // Assigning this to a const so Flow knows it won't change in the closure
      const resolvedInst = inst;

      if (__DEV__) {
        checkPropStringCoercion(mixedRef, 'ref');
      }
      const stringRef = '' + mixedRef;
      // Check if previous string ref matches new string ref
      if (
        current !== null &&
        current.ref !== null &&
        typeof current.ref === 'function' &&
        current.ref._stringRef === stringRef
      ) {
        return current.ref;
      }
      const ref = function(value) {
        let refs = resolvedInst.refs;
        if (refs === emptyRefsObject) {
          // This is a lazy pooled frozen object, so we need to initialize.
          refs = resolvedInst.refs = {};
        }
        if (value === null) {
          delete refs[stringRef];
        } else {
          refs[stringRef] = value;
        }
      };
      ref._stringRef = stringRef;
      return ref;
    } else {
      if (typeof mixedRef !== 'string') {
        throw new Error(
          'Expected ref to be a function, a string, an object returned by React.createRef(), or null.',
        );
      }

      if (!element._owner) {
        throw new Error(
          `Element ref was specified as a string (${mixedRef}) but no owner was set. This could happen for one of` +
            ' the following reasons:\n' +
            '1. You may be adding a ref to a function component\n' +
            "2. You may be adding a ref to a component that was not created inside a component's render method\n" +
            '3. You have multiple copies of React loaded\n' +
            'See https://reactjs.org/link/refs-must-have-owner for more information.',
        );
      }
    }
  }
  return mixedRef;
}

function throwOnInvalidObjectType(returnFiber: Fiber, newChild: Object) {
  const childString = Object.prototype.toString.call(newChild);

  throw new Error(
    `Objects are not valid as a React child (found: ${
      childString === '[object Object]'
        ? 'object with keys {' + Object.keys(newChild).join(', ') + '}'
        : childString
    }). ` +
      'If you meant to render a collection of children, use an array ' +
      'instead.',
  );
}

function warnOnFunctionType(returnFiber: Fiber) {
  if (__DEV__) {
    const componentName = getComponentNameFromFiber(returnFiber) || 'Component';

    if (ownerHasFunctionTypeWarning[componentName]) {
      return;
    }
    ownerHasFunctionTypeWarning[componentName] = true;

    console.error(
      'Functions are not valid as a React child. This may happen if ' +
        'you return a Component instead of <Component /> from render. ' +
        'Or maybe you meant to call this function rather than return it.',
    );
  }
}

function resolveLazy(lazyType) {
  const payload = lazyType._payload;
  const init = lazyType._init;
  return init(payload);
}

// This wrapper function exists because I expect to clone the code in each path
// to be able to optimize each path individually by branching early. This needs
// a compiler or we can do it manually. Helpers that don't need this branching
// live outside of this function.
/**
 * shouldTrackSideEffects ，这个参数的字面意思是“是否需要追踪副作用”，所谓的“副作用”，指的就是
 * 是否需要做 DOM 操作，需要的话就会在当前 Fiber 节点中打上 EffectTag ，即“追踪”副作用；
 * 而也仅有在 update 的时候，才需要“追踪副作用”，即把 current 这个 Fiber 节点与本次更新组件
 * 状态后的 ReactElement 做对比(diff)，然后得出本次更新的 Fiber 节点，以及在该节点上打上 diff 的结果 —— EffectTag
 * 相关文档： https://juejin.cn/post/6844903901590716429
 * @param {boolean} shouldTrackSideEffects
 * @returns {(function(Fiber, (Fiber|null), *, Lanes): (Fiber|null))|*}
 * @constructor
 */
function ChildReconciler(shouldTrackSideEffects) {
  /**
   * 将returnFiber子元素中，需要删除的fiber节点放到deletions的副作用数组中
   * 该方法只删除一个节点
   * 当前diff时不会立即删除，而是在更新时，将该数组中的fiber节点进行删除
   * @param returnFiber
   * @param childToDelete
   */
  function deleteChild(returnFiber: Fiber, childToDelete: Fiber): void {
    if (!shouldTrackSideEffects) {
      // Noop.
      // 初始化fiber节点时，直接返回，不进行任何操作
      return;
    }
    const deletions = returnFiber.deletions;
    if (deletions === null) {
      // 若副作用数组为空，则创建一个
      returnFiber.deletions = [childToDelete];
      returnFiber.flags |= ChildDeletion;
    } else {
      // 否则直接推入
      deletions.push(childToDelete);
    }
  }

  /**
   * 删除returnFiber的子元素中，currentFirstChild和其兄弟元素
   * 即把currentFirstChild及其兄弟元素，都放到returnFiber的deletions的副作用数组中，等待删除
   * 这是一个批量删除节点的方法
   * @param returnFiber 要删除节点的父级节点
   * @param currentFirstChild 当前要删除节点的起始节点
   * @returns {null}
   */
  function deleteRemainingChildren(
    returnFiber: Fiber,
    currentFirstChild: Fiber | null,
  ): null {
    if (!shouldTrackSideEffects) {
      // Noop.
      return null;
    }

    // TODO: For the shouldClone case, this could be micro-optimized a bit by
    // assuming that after the first child we've already added everything.
    let childToDelete = currentFirstChild;
    while (childToDelete !== null) {
      deleteChild(returnFiber, childToDelete);
      childToDelete = childToDelete.sibling;
    }
    return null;
  }

  /**
   * 将currentFirstChild和后续所有的兄弟节点放到map中，方便查找
   * 若该fiber节点有key，则使用该key作为map的key；否则使用隐性的index作为map的key
   * @param returnFiber
   * @param currentFirstChild
   * @returns {Map<string|number, Fiber>}
   */
  function mapRemainingChildren(
    returnFiber: Fiber,
    currentFirstChild: Fiber,
  ): Map<string | number, Fiber> {
    // Add the remaining children to a temporary map so that we can find them by
    // keys quickly. Implicit (null) keys get added to this set with their index
    // instead.
    const existingChildren: Map<string | number, Fiber> = new Map();

    let existingChild = currentFirstChild;
    while (existingChild !== null) {
      if (existingChild.key !== null) {
        existingChildren.set(existingChild.key, existingChild);
      } else {
        existingChildren.set(existingChild.index, existingChild);
      }
      existingChild = existingChild.sibling;
    }
    return existingChildren;
  }

  /**
   * 复用fiber节点的alternate，生成一个新的fiber节点
   * 若alternate为空，则创建；
   * 若不为空，则直接复用，并将传入的fiber属性和pendingProps的属性给到alternate上
   * @param fiber
   * @param pendingProps
   * @returns {Fiber}
   */
  function useFiber(fiber: Fiber, pendingProps: mixed): Fiber {
    // We currently set sibling to null and index to 0 here because it is easy
    // to forget to do before returning it. E.g. for the single child case.
    const clone = createWorkInProgress(fiber, pendingProps);
    clone.index = 0;
    clone.sibling = null;
    return clone;
  }

  /**
   * 标记最近一次访问旧fiber节点最大的下标
   * https://github.com/wenzi0github/react/issues/16
   * @param {Fiber} newFiber
   * @param lastPlacedIndex
   * @param newIndex
   * @returns {number}
   */
  function placeChild(
    newFiber: Fiber,
    lastPlacedIndex: number,
    newIndex: number,
  ): number {
    newFiber.index = newIndex; // 新fiber节点的索引
    if (!shouldTrackSideEffects) {
      // During hydration, the useId algorithm needs to know which fibers are
      // part of a list of children (arrays, iterators).
      newFiber.flags |= Forked;
      return lastPlacedIndex;
    }
    const current = newFiber.alternate;
    if (current !== null) {
      const oldIndex = current.index;
      if (oldIndex < lastPlacedIndex) {
        // This is a move.
        newFiber.flags |= Placement;
        return lastPlacedIndex;
      } else {
        // This item can stay in place.
        return oldIndex;
      }
    } else {
      // This is an insertion.
      newFiber.flags |= Placement;
      return lastPlacedIndex;
    }
  }

  /**
   * 为单个fiber节点添加更新操作
   * @param newFiber
   * @returns {Fiber}
   */
  function placeSingleChild(newFiber: Fiber): Fiber {
    // This is simpler for the single child case. We only need to do a
    // placement for inserting new children.
    if (shouldTrackSideEffects && newFiber.alternate === null) {
      newFiber.flags |= Placement;
    }
    return newFiber;
  }

  /**
   * 更新文本节点
   * 若当前current fiber为空，或者不是文本节点，则新创建一个文本节点
   * 若当前是文本节点，则更新其内容
   * @param returnFiber
   * @param current
   * @param textContent
   * @param lanes
   * @returns {Fiber}
   */
  function updateTextNode(
    returnFiber: Fiber,
    current: Fiber | null,
    textContent: string,
    lanes: Lanes,
  ) {
    if (current === null || current.tag !== HostText) {
      // Insert
      const created = createFiberFromText(textContent, returnFiber.mode, lanes);
      created.return = returnFiber;
      return created;
    } else {
      // Update
      const existing = useFiber(current, textContent);
      existing.return = returnFiber;
      return existing;
    }
  }

  /**
   * 尽量复用current的fiber节点来将element创建新的fiber节点
   * 调用该方法之前，已判断过current的fiber节点与element的key是相同的，
   * 但实际上 elementType 也得相同才能复用；否则就得新创建了
   * @param returnFiber
   * @param current
   * @param element
   * @param lanes
   * @returns {Fiber}
   */
  function updateElement(
    returnFiber: Fiber,
    current: Fiber | null,
    element: ReactElement,
    lanes: Lanes,
  ): Fiber {
    const elementType = element.type;
    if (elementType === REACT_FRAGMENT_TYPE) {
      // fragment
      return updateFragment(
        returnFiber,
        current,
        element.props.children,
        lanes,
        element.key,
      );
    }
    if (current !== null) {
      /**
       * 若当前树已存在fiber节点，判断fiber节点的elementType和将要构建的element.type是否相同
       * fiber节点的elementType（或 element.type）有三种类型：
       * 1. 普通的html标签，type为该标签的tagName，如div, span等；
       * 2. 当前是Function Component节点时，则type该组件的函数体，即可以执行type()；
       * 3. 当前是Class Component节点，则type为该class，可以通过该type，new出一个实例；
       */
      if (
        current.elementType === elementType ||
        // Keep this check inline so it only runs on the false path:
        (__DEV__
          ? isCompatibleFamilyForHotReloading(current, element)
          : false) ||
        // Lazy types should reconcile their resolved type.
        // We need to do this after the Hot Reloading check above,
        // because hot reloading has different semantics than prod because
        // it doesn't resuspend. So we can't let the call below suspend.
        (typeof elementType === 'object' &&
          elementType !== null &&
          elementType.$$typeof === REACT_LAZY_TYPE &&
          resolveLazy(elementType) === current.type)
      ) {
        // Move based on index
        // 复用current的fiber节点，将element中的props给到这个fiber节点
        const existing = useFiber(current, element.props);
        existing.ref = coerceRef(returnFiber, current, element);
        existing.return = returnFiber;
        if (__DEV__) {
          existing._debugSource = element._source;
          existing._debugOwner = element._owner;
        }
        return existing;
      }
    }
    // Insert
    // 若current为null或elementType不相等，则直接进行创建
    const created = createFiberFromElement(element, returnFiber.mode, lanes);
    created.ref = coerceRef(returnFiber, current, element);
    created.return = returnFiber;
    return created;
  }

  function updatePortal(
    returnFiber: Fiber,
    current: Fiber | null,
    portal: ReactPortal,
    lanes: Lanes,
  ): Fiber {
    if (
      current === null ||
      current.tag !== HostPortal ||
      current.stateNode.containerInfo !== portal.containerInfo ||
      current.stateNode.implementation !== portal.implementation
    ) {
      // Insert
      const created = createFiberFromPortal(portal, returnFiber.mode, lanes);
      created.return = returnFiber;
      return created;
    } else {
      // Update
      const existing = useFiber(current, portal.children || []);
      existing.return = returnFiber;
      return existing;
    }
  }

  function updateFragment(
    returnFiber: Fiber,
    current: Fiber | null,
    fragment: Iterable<*>,
    lanes: Lanes,
    key: null | string,
  ): Fiber {
    if (current === null || current.tag !== Fragment) {
      // Insert
      const created = createFiberFromFragment(
        fragment,
        returnFiber.mode,
        lanes,
        key,
      );
      created.return = returnFiber;
      return created;
    } else {
      // Update
      const existing = useFiber(current, fragment);
      existing.return = returnFiber;
      return existing;
    }
  }

  /**
   * 将单个不知类型的虚拟dom创建为fiber节点
   * @param {Fiber} returnFiber 父级节点
   * @param {any} newChild 当前虚拟dom
   * @param {Lanes} lanes 优先级
   * @returns {Fiber|null}
   */
  function createChild(
    returnFiber: Fiber,
    newChild: any,
    lanes: Lanes,
  ): Fiber | null {
    if (
      (typeof newChild === 'string' && newChild !== '') ||
      typeof newChild === 'number'
    ) {
      // Text nodes don't have keys. If the previous node is implicitly keyed
      // we can continue to replace it without aborting even if it is not a text
      // node.
      // 纯文本节点没有key，即使上一个节点有key，我们也可以继续替换
      const created = createFiberFromText(
        '' + newChild,
        returnFiber.mode,
        lanes,
      );
      created.return = returnFiber;
      return created;
    }

    if (typeof newChild === 'object' && newChild !== null) {
      // 若newChild是一个object类型，则判断他的ReactElement类型
      switch (newChild.$$typeof) {
        case REACT_ELEMENT_TYPE: {
          // 普通的react格式组件
          const created = createFiberFromElement(
            newChild,
            returnFiber.mode,
            lanes,
          );
          created.ref = coerceRef(returnFiber, null, newChild);
          created.return = returnFiber;
          return created;
        }
        case REACT_PORTAL_TYPE: {
          // portal组件
          const created = createFiberFromPortal(
            newChild,
            returnFiber.mode,
            lanes,
          );
          created.return = returnFiber;
          return created;
        }
        case REACT_LAZY_TYPE: {
          // 懒加载组件，则执行挂载在 newChild 上的_init，
          // 递归调用createChild
          const payload = newChild._payload;
          const init = newChild._init;
          return createChild(returnFiber, init(payload), lanes);
        }
      }

      // 若newChild是数组，则创建为fragment类型的组件
      if (isArray(newChild) || getIteratorFn(newChild)) {
        const created = createFiberFromFragment(
          newChild,
          returnFiber.mode,
          lanes,
          null,
        );
        created.return = returnFiber;
        return created;
      }

      // 没有对应的格式，则提出警告
      throwOnInvalidObjectType(returnFiber, newChild);
    }

    if (__DEV__) {
      if (typeof newChild === 'function') {
        // function类型的，不能直接作为React组件，需要将其改为 <Component />，
        // 或者想直接执行它，使用他的返回结果
        warnOnFunctionType(returnFiber);
      }
    }

    /**
     * 这是一个空节点，其他类型的都是返回null
     * 比如一个表达式的结果为false，{isShow && <p>p tag</p>}，当isShow为false时，
     * 整个表达式就为false，那么 newChild 就是 false，最终会返回一个null节点
     */
    return null;
  }

  /**
   * 创建或更新element结构 newChild 为fiber节点
   * 若oldFiber不为空，且newChild与oldFiber的key能对得上，则复用旧fiber节点
   * 否则，创建一个新的fiber节点
   * 该updateSlot方法与createChild方法很像，但createChild只有创建新fiber节点的功能
   * 而该updateSlot()方法则可以根据oldFiber，来决定是复用之前的fiber节点，还是新创建节点
   * @param returnFiber
   * @param oldFiber
   * @param newChild
   * @param lanes
   * @returns {Fiber|null}
   */
  function updateSlot(
    returnFiber: Fiber,
    oldFiber: Fiber | null,
    newChild: any,
    lanes: Lanes,
  ): Fiber | null {
    // Update the fiber if the keys match, otherwise return null.

    const key = oldFiber !== null ? oldFiber.key : null;

    if (
      (typeof newChild === 'string' && newChild !== '') ||
      typeof newChild === 'number'
    ) {
      // Text nodes don't have keys. If the previous node is implicitly keyed
      // we can continue to replace it without aborting even if it is not a text
      // node.
      // 文本节点本身是没有key的，若旧fiber节点有key，则说明无法复用
      if (key !== null) {
        return null;
      }
      // 若旧fiber没有key，即使他不是文本节点，我们也尝试复用
      return updateTextNode(returnFiber, oldFiber, '' + newChild, lanes);
    }

    if (typeof newChild === 'object' && newChild !== null) {
      // 若是一些ReactElement类型的，则判断key是否相等；相等则复用；不相等则返回null
      switch (newChild.$$typeof) {
        case REACT_ELEMENT_TYPE: {
          if (newChild.key === key) {
            return updateElement(returnFiber, oldFiber, newChild, lanes);
          } else {
            return null;
          }
        }
        case REACT_PORTAL_TYPE: {
          if (newChild.key === key) {
            return updatePortal(returnFiber, oldFiber, newChild, lanes);
          } else {
            return null;
          }
        }
        case REACT_LAZY_TYPE: {
          const payload = newChild._payload;
          const init = newChild._init;
          return updateSlot(returnFiber, oldFiber, init(payload), lanes);
        }
      }

      if (isArray(newChild) || getIteratorFn(newChild)) {
        if (key !== null) {
          return null;
        }

        // 若 newChild 是数组或者迭代类型，则更新为fragment类型
        return updateFragment(returnFiber, oldFiber, newChild, lanes, null);
      }

      throwOnInvalidObjectType(returnFiber, newChild);
    }

    if (__DEV__) {
      if (typeof newChild === 'function') {
        warnOnFunctionType(returnFiber);
      }
    }

    return null;
  }

  /**
   * 尽量复用map中存储的老fiber节点，来构建新的fiber节点
   * @param existingChildren
   * @param returnFiber
   * @param newIdx
   * @param newChild
   * @param lanes
   * @returns {Fiber|null}
   */
  function updateFromMap(
    existingChildren: Map<string | number, Fiber>,
    returnFiber: Fiber,
    newIdx: number,
    newChild: any,
    lanes: Lanes,
  ): Fiber | null {
    if (
      (typeof newChild === 'string' && newChild !== '') ||
      typeof newChild === 'number'
    ) {
      // Text nodes don't have keys, so we neither have to check the old nor
      // new node for the key. If both are text nodes, they match.
      // 文本节点本身就没有Key，所以我们不去检测旧节点和新节点的key是否匹配，
      // 只要旧节点是文本节点就直接复用；否则若matchedFiber为null或不是文本节点，就新创建一个文本节点
      const matchedFiber = existingChildren.get(newIdx) || null;
      return updateTextNode(returnFiber, matchedFiber, '' + newChild, lanes);
    }

    if (typeof newChild === 'object' && newChild !== null) {
      // ReactElement类型的节点，则通过key或index获取旧的fiber节点，
      // 然后调用相应的方法来复用或创建新的fiber节点
      switch (newChild.$$typeof) {
        case REACT_ELEMENT_TYPE: {
          const matchedFiber =
            existingChildren.get(
              newChild.key === null ? newIdx : newChild.key,
            ) || null;
          return updateElement(returnFiber, matchedFiber, newChild, lanes);
        }
        case REACT_PORTAL_TYPE: {
          const matchedFiber =
            existingChildren.get(
              newChild.key === null ? newIdx : newChild.key,
            ) || null;
          return updatePortal(returnFiber, matchedFiber, newChild, lanes);
        }
        case REACT_LAZY_TYPE:
          const payload = newChild._payload;
          const init = newChild._init;
          return updateFromMap(
            existingChildren,
            returnFiber,
            newIdx,
            init(payload),
            lanes,
          );
      }

      if (isArray(newChild) || getIteratorFn(newChild)) {
        const matchedFiber = existingChildren.get(newIdx) || null;
        return updateFragment(returnFiber, matchedFiber, newChild, lanes, null);
      }

      throwOnInvalidObjectType(returnFiber, newChild);
    }

    if (__DEV__) {
      if (typeof newChild === 'function') {
        warnOnFunctionType(returnFiber);
      }
    }

    return null;
  }

  /**
   * Warns if there is a duplicate or missing key
   */
  function warnOnInvalidKey(
    child: mixed,
    knownKeys: Set<string> | null,
    returnFiber: Fiber,
  ): Set<string> | null {
    if (__DEV__) {
      if (typeof child !== 'object' || child === null) {
        return knownKeys;
      }
      switch (child.$$typeof) {
        case REACT_ELEMENT_TYPE:
        case REACT_PORTAL_TYPE:
          warnForMissingKey(child, returnFiber);
          const key = child.key;
          if (typeof key !== 'string') {
            break;
          }
          if (knownKeys === null) {
            knownKeys = new Set();
            knownKeys.add(key);
            break;
          }
          if (!knownKeys.has(key)) {
            knownKeys.add(key);
            break;
          }
          console.error(
            'Encountered two children with the same key, `%s`. ' +
              'Keys should be unique so that components maintain their identity ' +
              'across updates. Non-unique keys may cause children to be ' +
              'duplicated and/or omitted — the behavior is unsupported and ' +
              'could change in a future version.',
            key,
          );
          break;
        case REACT_LAZY_TYPE:
          const payload = child._payload;
          const init = (child._init: any);
          warnOnInvalidKey(init(payload), knownKeys, returnFiber);
          break;
        default:
          break;
      }
    }
    return knownKeys;
  }

  /**
   * element结构是一个数组，将会构建出一个单向链表
   * 对数组创建fiber结构时，比较复杂，主要是在复用时考虑的因素比较多，如：
   * 1. 新element结构在最后插入的元素，即之前的fiber链表遍历完了，新结构还有剩余；
   * 2. 新element中间插入了元素，则后续可复用的元素向后移动；
   * 3. 新element删除了元素；
   * 4. 修改数据，这个还好，若key和tag对应上，直接复用这个节点，并修改上面的props；
   * https://www.cnblogs.com/echolun/p/16414562.html
   * @param {Fiber} returnFiber 当前节点的父级节点
   * @param {Fiber|null} currentFirstChild 当前正在使用的节点
   * @param {Array<*>} newChildren element结构
   * @param {Lanes} lanes 优先级
   * @returns {Fiber} 返回通过element结构构建好的第1个fiber节点（这里是一个链表，但只需要返回头部节点即可）
   */
  function reconcileChildrenArray(
    returnFiber: Fiber,
    currentFirstChild: Fiber | null,
    newChildren: Array<*>,
    lanes: Lanes,
  ): Fiber | null {
    // This algorithm can't optimize by searching from both ends since we
    // don't have backpointers on fibers. I'm trying to see how far we can get
    // with that model. If it ends up not being worth the tradeoffs, we can
    // add it later.
    // 该算法无法通过两端搜索进行优化，因为我们在光纤上没有反向指针。
    // 我想看看我们能用那个模型走多远。如果最终不值得权衡，我们可以稍后再添加。

    // Even with a two ended optimization, we'd want to optimize for the case
    // where there are few changes and brute force the comparison instead of
    // going for the Map. It'd like to explore hitting that path first in
    // forward-only mode and only go for the Map once we notice that we need
    // lots of look ahead. This doesn't handle reversal as well as two ended
    // search but that's unusual. Besides, for the two ended optimization to
    // work on Iterables, we'd need to copy the whole set.

    // In this first iteration, we'll just live with hitting the bad case
    // (adding everything to a Map) in for every insert/move.

    // If you change this code, also update reconcileChildrenIterator() which
    // uses the same algorithm.

    if (__DEV__) {
      // First, validate keys.
      let knownKeys = null;
      for (let i = 0; i < newChildren.length; i++) {
        const child = newChildren[i];
        knownKeys = warnOnInvalidKey(child, knownKeys, returnFiber);
      }
    }

    let resultingFirstChild: Fiber | null = null; // 新构建出来的fiber链表的第1个节点
    let previousNewFiber: Fiber | null = null; // 新构建出来链表的上一个fiber节点

    let oldFiber = currentFirstChild; // 旧链表的节点，刚开始指向到第1个节点
    let lastPlacedIndex = 0; // 表示当前已经新建的 Fiber 的 index 的最大值，为 placeChild 函数服务
    let newIdx = 0; // 表示遍历 newChildren 的索引指针
    let nextOldFiber = null; // 表示 oldFiber 的下一个右紧邻兄弟 fiber
    for (; oldFiber !== null && newIdx < newChildren.length; newIdx++) {
      if (oldFiber.index > newIdx) {
        /**
         * oldIndex 大于 newIndex，那么需要旧的 fiber 等待新的 fiber，一直等到位置相同。
         * 什么时候会出现这种情况？当中间出现无法转为fiber节点的元素时，下次对比时，就会出现，
         * 具体可以参考这篇文章： https://github.com/wenzi0github/react/issues/15
         * 当 oldFiber.index > newIdx 时，说明新的element有插入新的元素，这时将oldFiber设置为null，
         * 然后调用 updateSlot() 时，就不再考虑复用的问题了，直接创建新的节点。
         * 下一个旧的fiber还是当前的节点，等待index索引相等的那个child
         */
        nextOldFiber = oldFiber;
        oldFiber = null;
      } else {
        // 旧fiber的索引和newChildren的索引匹配上了，获取oldFiber的下一个兄弟节点
        nextOldFiber = oldFiber.sibling;
      }

      /**
       * 将当前节点和当前的child的element传进去，
       * 1. 若 key 对应上
       * 1.1 若 type 对应上，则复用之前的节点；
       * 1.2 若 type 对应不上，则直接创建新的fiber节点；
       * 2. 若 key 对应不上，无法复用，返回 null；
       * 3. 若 oldFiber 为null，则直接创建新的fiber节点；
       * @type {Fiber}
       */
      const newFiber = updateSlot(
        returnFiber,
        oldFiber,
        newChildren[newIdx],
        lanes,
      );
      if (newFiber === null) {
        // key不相等，退出循环
        // TODO: This breaks on empty slots like null children. That's
        // unfortunate because it triggers the slow path all the time. We need
        // a better way to communicate whether this was a miss or null,
        // boolean, undefined, etc.
        if (oldFiber === null) {
          oldFiber = nextOldFiber;
        }
        break;
      }
      if (shouldTrackSideEffects) {
        if (oldFiber && newFiber.alternate === null) {
          // We matched the slot, but we didn't reuse the existing fiber, so we
          // need to delete the existing child.
          // 若旧fiber节点存在，但新节点并没有复用该节点，则将该旧节点删除
          deleteChild(returnFiber, oldFiber);
        }
      }
      lastPlacedIndex = placeChild(newFiber, lastPlacedIndex, newIdx);
      if (previousNewFiber === null) {
        // TODO: Move out of the loop. This only happens for the first run.
        // 若整个链表为空，则头指针指向到newFiber
        resultingFirstChild = newFiber;
      } else {
        // TODO: Defer siblings if we're not at the right index for this slot.
        // I.e. if we had null values before, then we want to defer this
        // for each null value. However, we also don't want to call updateSlot
        // with the previous one.
        // 若链表不为空，则将newFiber放到链表的后面
        previousNewFiber.sibling = newFiber;
      }
      previousNewFiber = newFiber;
      oldFiber = nextOldFiber;
    }

    // 退出循环，要么说明所有的节点都可以复用，正常循环完毕；要么是有一个节点无法复用

    // 循环长度跟newChildren的长度一样，可能新数组长度小于等于老数组
    // 老数组后面可能有剩余的，需要删除
    if (newIdx === newChildren.length) {
      // We've reached the end of the new children. We can delete the rest.
      deleteRemainingChildren(returnFiber, oldFiber);
      if (getIsHydrating()) {
        // 注水操作，暂不考虑
        const numberOfForks = newIdx;
        pushTreeFork(returnFiber, numberOfForks);
      }
      // 返回新链表的头节点指针
      return resultingFirstChild;
    }

    // 若旧数据中所有的节点都复用了，说明新数组还有剩余
    if (oldFiber === null) {
      // If we don't have any more existing children we can choose a fast path
      // since the rest will all be insertions.
      // 若没有旧的节点，这里直接进行创建，并返回这个队列的第1个fiber节点
      for (; newIdx < newChildren.length; newIdx++) {
        const newFiber = createChild(returnFiber, newChildren[newIdx], lanes);
        if (newFiber === null) {
          continue;
        }
        lastPlacedIndex = placeChild(newFiber, lastPlacedIndex, newIdx);

        // 接着上面的链表往后拼接
        if (previousNewFiber === null) {
          // TODO: Move out of the loop. This only happens for the first run.
          // 记录起始的第1个节点
          resultingFirstChild = newFiber;
        } else {
          previousNewFiber.sibling = newFiber;
        }
        previousNewFiber = newFiber;
      }
      if (getIsHydrating()) {
        const numberOfForks = newIdx;
        pushTreeFork(returnFiber, numberOfForks);
      }
      return resultingFirstChild;
    }

    /**
     * 执行到这里，说明上面的两种情况都不满足，那就表示有可能顺序换了或者其他情况
     * 即存在无法顺序复用的节点
     * 这里我们老数组中剩余的fiber节点放到map中，方便快速查找
     */
    // Add all children to a key map for quick lookups.
    const existingChildren = mapRemainingChildren(returnFiber, oldFiber);

    // Keep scanning and use the map to restore deleted items as moves.
    for (; newIdx < newChildren.length; newIdx++) {
      // 复用map中存储的旧fiber节点（如果可以复用的话）
      const newFiber = updateFromMap(
        existingChildren,
        returnFiber,
        newIdx,
        newChildren[newIdx],
        lanes,
      );
      if (newFiber !== null) {
        // 只考虑转成fiber节点的情况，
        // 若没有转成，则可能是类型不对，比如是boolean, null等类型
        if (shouldTrackSideEffects) {
          // 若需要记录副作用
          if (newFiber.alternate !== null) {
            // The new fiber is a work in progress, but if there exists a
            // current, that means that we reused the fiber. We need to delete
            // it from the child list so that we don't add it to the deletion
            // list.
            // newFiber.alternate指向到current，若current不为空，说明复用了该fiber节点，
            // 这里我们要在map中删除，避免后续添加到deletion的副作用队列中
            existingChildren.delete(
              newFiber.key === null ? newIdx : newFiber.key,
            );
          }
        }
        lastPlacedIndex = placeChild(newFiber, lastPlacedIndex, newIdx);
        // 接着之前的链表进行拼接
        if (previousNewFiber === null) {
          resultingFirstChild = newFiber;
        } else {
          previousNewFiber.sibling = newFiber;
        }
        previousNewFiber = newFiber;
      }
    }

    if (shouldTrackSideEffects) {
      // Any existing children that weren't consumed above were deleted. We need
      // to add them to the deletion list.
      // 将map中没有复用的fiber节点添加到删除的副作用队列中，等待删除
      existingChildren.forEach(child => deleteChild(returnFiber, child));
    }

    if (getIsHydrating()) {
      const numberOfForks = newIdx;
      pushTreeFork(returnFiber, numberOfForks);
    }
    return resultingFirstChild;
  }

  function reconcileChildrenIterator(
    returnFiber: Fiber,
    currentFirstChild: Fiber | null,
    newChildrenIterable: Iterable<*>,
    lanes: Lanes,
  ): Fiber | null {
    // This is the same implementation as reconcileChildrenArray(),
    // but using the iterator instead.

    const iteratorFn = getIteratorFn(newChildrenIterable);

    if (typeof iteratorFn !== 'function') {
      throw new Error(
        'An object is not an iterable. This error is likely caused by a bug in ' +
          'React. Please file an issue.',
      );
    }

    if (__DEV__) {
      // We don't support rendering Generators because it's a mutation.
      // See https://github.com/facebook/react/issues/12995
      if (
        typeof Symbol === 'function' &&
        // $FlowFixMe Flow doesn't know about toStringTag
        newChildrenIterable[Symbol.toStringTag] === 'Generator'
      ) {
        if (!didWarnAboutGenerators) {
          console.error(
            'Using Generators as children is unsupported and will likely yield ' +
              'unexpected results because enumerating a generator mutates it. ' +
              'You may convert it to an array with `Array.from()` or the ' +
              '`[...spread]` operator before rendering. Keep in mind ' +
              'you might need to polyfill these features for older browsers.',
          );
        }
        didWarnAboutGenerators = true;
      }

      // Warn about using Maps as children
      if ((newChildrenIterable: any).entries === iteratorFn) {
        if (!didWarnAboutMaps) {
          console.error(
            'Using Maps as children is not supported. ' +
              'Use an array of keyed ReactElements instead.',
          );
        }
        didWarnAboutMaps = true;
      }

      // First, validate keys.
      // We'll get a different iterator later for the main pass.
      const newChildren = iteratorFn.call(newChildrenIterable);
      if (newChildren) {
        let knownKeys = null;
        let step = newChildren.next();
        for (; !step.done; step = newChildren.next()) {
          const child = step.value;
          knownKeys = warnOnInvalidKey(child, knownKeys, returnFiber);
        }
      }
    }

    const newChildren = iteratorFn.call(newChildrenIterable);

    if (newChildren == null) {
      throw new Error('An iterable object provided no iterator.');
    }

    let resultingFirstChild: Fiber | null = null;
    let previousNewFiber: Fiber | null = null;

    let oldFiber = currentFirstChild;
    let lastPlacedIndex = 0;
    let newIdx = 0;
    let nextOldFiber = null;

    let step = newChildren.next();
    for (
      ;
      oldFiber !== null && !step.done;
      newIdx++, step = newChildren.next()
    ) {
      if (oldFiber.index > newIdx) {
        nextOldFiber = oldFiber;
        oldFiber = null;
      } else {
        nextOldFiber = oldFiber.sibling;
      }
      const newFiber = updateSlot(returnFiber, oldFiber, step.value, lanes);
      if (newFiber === null) {
        // TODO: This breaks on empty slots like null children. That's
        // unfortunate because it triggers the slow path all the time. We need
        // a better way to communicate whether this was a miss or null,
        // boolean, undefined, etc.
        if (oldFiber === null) {
          oldFiber = nextOldFiber;
        }
        break;
      }
      if (shouldTrackSideEffects) {
        if (oldFiber && newFiber.alternate === null) {
          // We matched the slot, but we didn't reuse the existing fiber, so we
          // need to delete the existing child.
          deleteChild(returnFiber, oldFiber);
        }
      }
      lastPlacedIndex = placeChild(newFiber, lastPlacedIndex, newIdx);
      if (previousNewFiber === null) {
        // TODO: Move out of the loop. This only happens for the first run.
        resultingFirstChild = newFiber;
      } else {
        // TODO: Defer siblings if we're not at the right index for this slot.
        // I.e. if we had null values before, then we want to defer this
        // for each null value. However, we also don't want to call updateSlot
        // with the previous one.
        previousNewFiber.sibling = newFiber;
      }
      previousNewFiber = newFiber;
      oldFiber = nextOldFiber;
    }

    if (step.done) {
      // We've reached the end of the new children. We can delete the rest.
      deleteRemainingChildren(returnFiber, oldFiber);
      if (getIsHydrating()) {
        const numberOfForks = newIdx;
        pushTreeFork(returnFiber, numberOfForks);
      }
      return resultingFirstChild;
    }

    if (oldFiber === null) {
      // If we don't have any more existing children we can choose a fast path
      // since the rest will all be insertions.
      for (; !step.done; newIdx++, step = newChildren.next()) {
        const newFiber = createChild(returnFiber, step.value, lanes);
        if (newFiber === null) {
          continue;
        }
        lastPlacedIndex = placeChild(newFiber, lastPlacedIndex, newIdx);
        if (previousNewFiber === null) {
          // TODO: Move out of the loop. This only happens for the first run.
          resultingFirstChild = newFiber;
        } else {
          previousNewFiber.sibling = newFiber;
        }
        previousNewFiber = newFiber;
      }
      if (getIsHydrating()) {
        const numberOfForks = newIdx;
        pushTreeFork(returnFiber, numberOfForks);
      }
      return resultingFirstChild;
    }

    // Add all children to a key map for quick lookups.
    const existingChildren = mapRemainingChildren(returnFiber, oldFiber);

    // Keep scanning and use the map to restore deleted items as moves.
    for (; !step.done; newIdx++, step = newChildren.next()) {
      const newFiber = updateFromMap(
        existingChildren,
        returnFiber,
        newIdx,
        step.value,
        lanes,
      );
      if (newFiber !== null) {
        if (shouldTrackSideEffects) {
          if (newFiber.alternate !== null) {
            // The new fiber is a work in progress, but if there exists a
            // current, that means that we reused the fiber. We need to delete
            // it from the child list so that we don't add it to the deletion
            // list.
            existingChildren.delete(
              newFiber.key === null ? newIdx : newFiber.key,
            );
          }
        }
        lastPlacedIndex = placeChild(newFiber, lastPlacedIndex, newIdx);
        if (previousNewFiber === null) {
          resultingFirstChild = newFiber;
        } else {
          previousNewFiber.sibling = newFiber;
        }
        previousNewFiber = newFiber;
      }
    }

    if (shouldTrackSideEffects) {
      // Any existing children that weren't consumed above were deleted. We need
      // to add them to the deletion list.
      existingChildren.forEach(child => deleteChild(returnFiber, child));
    }

    if (getIsHydrating()) {
      const numberOfForks = newIdx;
      pushTreeFork(returnFiber, numberOfForks);
    }
    return resultingFirstChild;
  }

  // 调度文本节点
  function reconcileSingleTextNode(
    returnFiber: Fiber,
    currentFirstChild: Fiber | null,
    textContent: string,
    lanes: Lanes,
  ): Fiber {
    // There's no need to check for keys on text nodes since we don't have a
    // way to define them.
    if (currentFirstChild !== null && currentFirstChild.tag === HostText) {
      // We already have an existing node so let's just update it and delete
      // the rest.
      deleteRemainingChildren(returnFiber, currentFirstChild.sibling);
      const existing = useFiber(currentFirstChild, textContent);
      existing.return = returnFiber;
      return existing;
    }
    // The existing first child is not a text node so we need to create one
    // and delete the existing ones.
    deleteRemainingChildren(returnFiber, currentFirstChild);
    const created = createFiberFromText(textContent, returnFiber.mode, lanes);
    created.return = returnFiber;
    return created;
  }

  /**
   * 单个普通ReactElement的构建
   * @param returnFiber
   * @param currentFirstChild
   * @param element
   * @param lanes
   * @returns {Fiber}
   */
  function reconcileSingleElement(
    returnFiber: Fiber,
    currentFirstChild: Fiber | null,
    element: ReactElement,
    lanes: Lanes,
  ): Fiber {
    // element是workInProgress中的，表示正在构建中的
    const key = element.key;

    // child: 现在正在使用的child
    let child = currentFirstChild;

    // 新节点是单个节点，但无法保证之前的节点也是单个节点，
    // 这里用循环查找第一个 key和节点类型都一样的节点，进行复用
    while (child !== null) {
      // TODO: If key === null and child.key === null, then this only applies to
      // the first item in the list.
      // 比较key值是否有变化，这是复用Fiber节点的先决条件
      // 若找到key一样的节点，即使都为null，那也是节点一样
      // 注意key为null我们也认为是相等，因为单个节点没有key也是正常的
      if (child.key === key) {
        const elementType = element.type;
        if (elementType === REACT_FRAGMENT_TYPE) {
          if (child.tag === Fragment) {
            deleteRemainingChildren(returnFiber, child.sibling); // 已找到可复用Fiber子节点且确认只有一个子节点，因此标记删除掉该child节点的所有sibling节点
            /**
             * useFiber是将当前可以复用的节点和属性传入，然后复制合并到workInProgress上
             * @type {Fiber}
             */
            const existing = useFiber(child, element.props.children); // 该节点是fragment类型，则复用其children
            existing.return = returnFiber; // 重置新Fiber节点的return指针，指向当前Fiber节点
            // 多说一句，fragment类型的fiber没有ref属性，这里不用处理
            if (__DEV__) {
              existing._debugSource = element._source;
              existing._debugOwner = element._owner;
            }
            return existing;
          }
        } else {
          if (
            child.elementType === elementType ||
            // Keep this check inline so it only runs on the false path:
            (__DEV__
              ? isCompatibleFamilyForHotReloading(child, element)
              : false) ||
            // Lazy types should reconcile their resolved type.
            // We need to do this after the Hot Reloading check above,
            // because hot reloading has different semantics than prod because
            // it doesn't resuspend. So we can't let the call below suspend.
            (typeof elementType === 'object' &&
              elementType !== null &&
              elementType.$$typeof === REACT_LAZY_TYPE &&
              resolveLazy(elementType) === child.type)
          ) {
            // 当前returnFiber是单个节点，若与child匹配上，则删除child后面所有的兄弟节点
            deleteRemainingChildren(returnFiber, child.sibling); // 已找到可复用Fiber子节点且确认只有一个子节点，因此标记删除掉该child节点的所有sibling节点
            const existing = useFiber(child, element.props); // 复用child节点和element.props属性
            existing.ref = coerceRef(returnFiber, child, element); // 处理ref
            existing.return = returnFiber; // 重置新Fiber节点的return指针，指向当前Fiber节点
            if (__DEV__) {
              existing._debugSource = element._source;
              existing._debugOwner = element._owner;
            }
            return existing;
          }
        }
        // Didn't match.
        // 若key一样，但节点类型没有匹配上，无法直接复用，则直接删除该节点和其兄弟节点，停止循环，
        // 开始走下面的创建新fiber节点的逻辑
        deleteRemainingChildren(returnFiber, child);
        break;
      } else {
        // 若key不一样，不能复用，标记删除当前单个child节点
        deleteChild(returnFiber, child);
      }
      child = child.sibling; // 指针指向下一个sibling节点
    }

    // 上面的一通循环没找到可以复用的节点，则接下来直接创建一个新的fiber节点
    if (element.type === REACT_FRAGMENT_TYPE) {
      // 若新节点的类型是 REACT_FRAGMENT_TYPE，则调用 createFiberFromFragment() 方法创建fiber节点
      // createFiberFromFragment()也是调用的createFiber()，第1个参数指定fragment类型
      // 然后再调用 new FiberNode() 创建一个fiber节点实例
      const created = createFiberFromFragment(
        element.props.children,
        returnFiber.mode,
        lanes,
        element.key,
      );
      created.return = returnFiber; // 新节点的return指向到父级节点
      // 额外的，fragment元素没有ref
      return created;
    } else {
      // 若新节点是其他类型，如普通的html元素、函数组件、类组件等，则会调用 createFiberFromElement()
      // 这里面再接着调用 createFiberFromTypeAndProps()，然后判断element的type是哪种类型
      // 然后再调用对应的create方法创建fiber节点
      const created = createFiberFromElement(element, returnFiber.mode, lanes);
      created.ref = coerceRef(returnFiber, currentFirstChild, element); // 处理ref
      created.return = returnFiber;
      return created;
    }
  }

  function reconcileSinglePortal(
    returnFiber: Fiber,
    currentFirstChild: Fiber | null,
    portal: ReactPortal,
    lanes: Lanes,
  ): Fiber {
    const key = portal.key;
    let child = currentFirstChild;
    while (child !== null) {
      // TODO: If key === null and child.key === null, then this only applies to
      // the first item in the list.
      if (child.key === key) {
        if (
          child.tag === HostPortal &&
          child.stateNode.containerInfo === portal.containerInfo &&
          child.stateNode.implementation === portal.implementation
        ) {
          deleteRemainingChildren(returnFiber, child.sibling);
          const existing = useFiber(child, portal.children || []);
          existing.return = returnFiber;
          return existing;
        } else {
          deleteRemainingChildren(returnFiber, child);
          break;
        }
      } else {
        deleteChild(returnFiber, child);
      }
      child = child.sibling;
    }

    const created = createFiberFromPortal(portal, returnFiber.mode, lanes);
    created.return = returnFiber;
    return created;
  }

  // This API will tag the children with the side-effect of the reconciliation
  // itself. They will be added to the side-effect list as we pass through the
  // children and the parent.
  // https://juejin.cn/post/7017702556629467167#heading-7
  /**
   * 将returnFiber节点（即当前的workInProgress对应的节点）里的element结构转为fiber结构
   * @param returnFiber
   * @param currentFirstChild current 树上对应的当前 Fiber 节点的第一个子 Fiber 节点，mount 时为 null，主要是为了是否能复用之前的节点
   * @param newChild returnFiber中的element结构，用来构建returnFiber的子节点
   * @param lanes
   * @returns {Fiber|*}
   */
  function reconcileChildFibers(
    returnFiber: Fiber, // 当前 Fiber 节点，即 workInProgress
    currentFirstChild: Fiber | null,
    newChild: any,
    lanes: Lanes, // 优先级相关
  ): Fiber | null {
    console.log('reconcileChildFibers', newChild);
    /**
     * 翻译下面的注释：
     * 当前函数不是递归函数。
     * 若顶层结构是一个数组，我们将其作为一组的数据进行处理，而不是一个fragment。
     * 另一方面，嵌套的数组将被视为fragment节点。
     * 递归行为会发生在正常流中（应该是在 workLoopSync->performUnitOfWork中，这里会循环完成所有的虚拟dom节点）
     */
    // This function is not recursive. // 该函数不是递归函数
    // If the top level item is an array, we treat it as a set of children,
    // not as a fragment. Nested arrays on the other hand will be treated as
    // fragment nodes. Recursion happens at the normal flow.

    // Handle top level unkeyed fragments as if they were arrays.
    // This leads to an ambiguity between <>{[...]}</> and <>...</>.
    // We treat the ambiguous cases above the same.

    // 是否是顶层的没有key的fragment组件
    const isUnkeyedTopLevelFragment =
      typeof newChild === 'object' &&
      newChild !== null &&
      newChild.type === REACT_FRAGMENT_TYPE &&
      newChild.key === null;

    // 若是顶层的fragment组件，则使用其children
    if (isUnkeyedTopLevelFragment) {
      newChild = newChild.props.children;
    }

    // Handle object types
    // 判断该节点的类型
    if (typeof newChild === 'object' && newChild !== null) {
      /**
       * 判断 newChild 的具体类型。
       * 1. 是普通React的函数组件、类组件、html标签等
       * 2. portal类型；
       * 3. lazy类型；
       * 4. newChild 是一个数组，即workInProgress节点下有并排多个结构，这时 newChild 就是一个数组
       * 5. 其他迭代类型，我暂时也不确定这哪种？
       */
      switch (newChild.$$typeof) {
        case REACT_ELEMENT_TYPE:
          // 一般的React组件，如<App />或<p></p>等
          return placeSingleChild(
            // 调度单体element结构的元素
            reconcileSingleElement(
              returnFiber,
              currentFirstChild,
              newChild,
              lanes,
            ),
          );
        case REACT_PORTAL_TYPE:
          return placeSingleChild(
            reconcileSinglePortal(
              returnFiber,
              currentFirstChild,
              newChild,
              lanes,
            ),
          );
        case REACT_LAZY_TYPE:
          const payload = newChild._payload;
          const init = newChild._init;
          // TODO: This function is supposed to be non-recursive.
          return reconcileChildFibers(
            returnFiber,
            currentFirstChild,
            init(payload),
            lanes,
          );
      }

      if (isArray(newChild)) {
        // 若 newChild 是个数组
        return reconcileChildrenArray(
          returnFiber,
          currentFirstChild,
          newChild,
          lanes,
        );
      }

      if (getIteratorFn(newChild)) {
        return reconcileChildrenIterator(
          returnFiber,
          currentFirstChild,
          newChild,
          lanes,
        );
      }

      throwOnInvalidObjectType(returnFiber, newChild);
    }

    if (
      (typeof newChild === 'string' && newChild !== '') ||
      typeof newChild === 'number'
    ) {
      // 文本类型
      return placeSingleChild(
        reconcileSingleTextNode(
          returnFiber,
          currentFirstChild,
          '' + newChild,
          lanes,
        ),
      );
    }

    if (__DEV__) {
      if (typeof newChild === 'function') {
        warnOnFunctionType(returnFiber);
      }
    }

    // Remaining cases are all treated as empty.
    // 标记删除没有复用上的fiber节点
    return deleteRemainingChildren(returnFiber, currentFirstChild);
  }

  return reconcileChildFibers;
}

export const reconcileChildFibers = ChildReconciler(true);
export const mountChildFibers = ChildReconciler(false); // 是否要追踪副作用，初始化时不用追踪

export function cloneChildFibers(
  current: Fiber | null,
  workInProgress: Fiber,
): void {
  if (current !== null && workInProgress.child !== current.child) {
    throw new Error('Resuming work not yet implemented.');
  }

  if (workInProgress.child === null) {
    return;
  }

  let currentChild = workInProgress.child;
  let newChild = createWorkInProgress(currentChild, currentChild.pendingProps);
  workInProgress.child = newChild;

  newChild.return = workInProgress;
  while (currentChild.sibling !== null) {
    currentChild = currentChild.sibling;
    newChild = newChild.sibling = createWorkInProgress(
      currentChild,
      currentChild.pendingProps,
    );
    newChild.return = workInProgress;
  }
  newChild.sibling = null;
}

// Reset a workInProgress child set to prepare it for a second pass.
export function resetChildFibers(workInProgress: Fiber, lanes: Lanes): void {
  let child = workInProgress.child;
  while (child !== null) {
    resetWorkInProgress(child, lanes);
    child = child.sibling;
  }
}
