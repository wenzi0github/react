/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict
 */

/**
 * https://github.com/wenzi0github/react/issues/6
 * heap是一个二叉堆的结构，即这是一个二叉树的结构，每个节点的元素都小于等于（或大于等于）两个子节点的值
 * 在数组中的存储方式：横向挨个儿存储
 * https://mp.weixin.qq.com/s?__biz=Mzg3NTcwMTUzNA==&mid=2247486312&idx=1&sn=e7d01cbd72dec43a7b39aeddae1b0e13&source=41#wechat_redirect
 * 插入时：在而插嘴的最后添加要插入的元素，并将其“上浮”到正确位置；
 */

type Heap = Array<Node>;
type Node = {|
  id: number,
  sortIndex: number,
|};

/**
 * 往队列中插入数据，然后升序排序，即优先级高的排在前面
 * @param {Heap} heap
 * @param {Node} node
 */
export function push(heap: Heap, node: Node): void {
  const index = heap.length;
  heap.push(node);
  siftUp(heap, node, index);
}

/**
 * 获取队列最前面的元素，若队列为空，则返回null
 * @param {Heap} heap 队列
 * @returns {Node | null}
 */
export function peek(heap: Heap): Node | null {
  return heap.length === 0 ? null : heap[0];
}

/**
 * 取出二叉堆中最顶层的元素，即优先级最高的元素
 * @param {*} heap
 * @returns
 */
export function pop(heap: Heap): Node | null {
  if (heap.length === 0) {
    return null;
  }
  const first = heap[0]; // 取出最顶层的元素
  const last = heap.pop(); // 取出最后的元素
  if (last !== first) {
    heap[0] = last; // 将最后的那个元素放在最顶层
    siftDown(heap, last, 0); // 下沉排序
  }
  return first;
}

/**
 * 二叉堆的上浮排序，优先级越高的，则越在最上面
 * 即sortIndex和taskId越小，排名越靠前，优先级越高
 * @param {*} heap 二叉堆
 * @param {*} node 插入的元素
 * @param {*} i 插入元素当前所在的位置
 * @returns
 */
function siftUp(heap, node, i) {
  let index = i;

  while (index > 0) {
    const parentIndex = (index - 1) >>> 1; // Math.floor((index-1)/2) 获取父级元素的位置
    const parent = heap[parentIndex];

    // 若node的优先级比parent的要高（即数值更小），则node节点和parent进行交换
    // 然后index再指向到刚才的parent位置，再与更高层的parent进行对比
    if (compare(parent, node) > 0) {
      // The parent is larger. Swap positions.
      heap[parentIndex] = node;
      heap[index] = parent;
      index = parentIndex;
    } else {
      // The parent is smaller. Exit.
      return;
    }
  }
}

/**
 * 与siftUp相反，进行二叉堆的下沉排序
 * 优先级更低（数值越大）的，则进行下沉
 * @param heap
 * @param node
 * @param i
 */
function siftDown(heap, node, i) {
  let index = i;
  const length = heap.length;
  const halfLength = length >>> 1; // 获取整个二叉堆的中间位置
  while (index < halfLength) {
    const leftIndex = (index + 1) * 2 - 1;
    const left = heap[leftIndex];
    const rightIndex = leftIndex + 1;
    const right = heap[rightIndex];

    // node当前为最顶层的元素
    // If the left or right node is smaller, swap with the smaller of those.
    if (compare(left, node) < 0) {
      // 左节点比node小
      if (rightIndex < length && compare(right, left) < 0) {
        // 若右节点比左节点更小，则node与右节点进行交换
        heap[index] = right;
        heap[rightIndex] = node;
        index = rightIndex;
      } else {
        // 若左节点比右节点更小，则node与左节点交换
        heap[index] = left;
        heap[leftIndex] = node;
        index = leftIndex;
      }
    } else if (rightIndex < length && compare(right, node) < 0) {
      // 右节点比node小，则node与右节点进行交换
      heap[index] = right;
      heap[rightIndex] = node;
      index = rightIndex;
    } else {
      // Neither child is smaller. Exit.
      // node本身就是最小的
      return;
    }
  }
}

/**
 * 对两个节点进行比较，优先比较sortIndex，然后再比较taskid
 * sortIndex 在同步执行队列 taskQueue 中，表示任务优先级对应的过期时间，过期时间越小，说明优先级越高，越需要优先执行；
 * sortIndex 在延迟执行队列timerQueue中，表示任务可以执行的开始时间，开始时间越小，表示优先级越高
 * 若过期时间或开始时间相同，则创建早的任务先执行
 * @param {Heap} a
 * @param {Heap} b
 * @returns {number}
 */
function compare(a, b) {
  // Compare sort index first, then task id.
  const diff = a.sortIndex - b.sortIndex;
  return diff !== 0 ? diff : a.id - b.id;
}
