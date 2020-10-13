// eslint-disable-next-line no-unused-vars
const mixin = {
  props: {
    nodeid: {
      type: String,
      default() {
        let p = this.$parent;
        while (p && !p.root) {
          p = p.$parent;
        }
        return p && p.nodeid;
      },
    },
    tplid: {
      type: String,
      default() {
        let p = this.$parent;
        while (p && !p.root) {
          p = p.$parent;
        }
        return p && p.tplid;
      },
    },
    root: {
      type: String,
      default: false,
    },
  },
  directives: {
    iv: {
      inserted(el) {
        el.classList.add('J-interative-area');
      },
      componentUpdated(el) {
        if (!el.classList.contains('J-interative-area')) {
          el.classList.add('J-interative-area');
        }
      },
    },
  },
  created() {
    /* eslint-disable-next-line */
    this.bridge = window.iBridge.getBridge(this._uid);
  },
  destroyed() {
    this.bridge.destroy();
  },
  data() {
    return {
      visible: false,
    };
  },
  methods: {
    show() {
      if (this.visible) return;
      this.visible = true;
      this.updateRect();
      if (this.root === 'true') {
        this.bridge.invoke('engine', 'showInteract');
      }
    },
    hide() {
      if (!this.visible) return;
      this.visible = false;
      this.updateRect();
      if (this.root === 'true') {
        this.$nextTick(() => {
          this.bridge.invoke('engine', 'hideInteract');
        });
      }
    },
    // 更新点击交互区域
    async updateRect() {
      console.log('HADESHE updateRect window.$$miniprogram: ', window.$$miniprogram);
      if (window.$$miniprogram) {
        // 如果是小程序，则不执行
        return;
      }

      // 等 nextTick 完后在执行计算
      this.$nextTick(() => {
        const BORDER = 5;
        const videoSizeWrapper = document.querySelector('.video-size-wrap');
        const childList = videoSizeWrapper.children;
        const rects = [];

        let minLeft = Infinity;
        let minTop = Infinity;
        let maxRight = -Infinity;
        let maxBottom = -Infinity;

        [...childList].forEach((child) => {
          const interativeComponents = [...child.querySelectorAll('.J-interative-area')];
          if ([...child.classList].includes('J-interative-area')) {
            interativeComponents.push(child);
          }
          if (interativeComponents.length === 0) return;

          // 计算 这个互动组件下 的所有交互组件
          interativeComponents.forEach((component) => {
            const { top, left, right, bottom } = component.getBoundingClientRect();
            // 当组件属于隐藏的时候，会都是 0，过滤掉
            if (top === 0 && left === 0 && right === 0 && bottom === 0) return;

            minTop = Math.min(minTop, top);
            minLeft = Math.min(minLeft, left);
            maxRight = Math.max(maxRight, right);
            maxBottom = Math.max(maxBottom, bottom);
            rects.push({ top, left, right, bottom });
          });
        });

        if (minLeft === Infinity || minTop === Infinity || maxRight === -Infinity || maxBottom === -Infinity) {
          // 交互清屏
          this.bridge.invoke('engine', 'fetch', {
            keyword: 'callback',
            methodName: 'setWebviewRects',
            data: [],
          });

          return;
        }

        // 增加点边框距离
        minTop = Math.max(minTop - BORDER, 0);
        minLeft = Math.max(minLeft - BORDER, 0);
        maxRight += BORDER;
        maxBottom += BORDER;

        // 预留能力，分成多个交互区域，先写死不用
        const isDevice = false;
        if (isDevice) {
          this.bridge.invoke('engine', 'fetch', {
            keyword: 'callback',
            methodName: 'setWebviewRects',
            data: rects,
          });
        } else {
          this.bridge.invoke('engine', 'fetch', {
            keyword: 'callback',
            methodName: 'setWebviewRects',
            data: [{ left: minLeft, top: minTop, right: maxRight, bottom: maxBottom }],
          });
        }
      });
    },
    proxy(codeHash, func) {
      const context = this;
      return function (e) {
        func(e);
        let touch = e.touches && e.touches[0];
        if (!touch) {
          touch = e.changedTouches && e.changedTouches[0];
        }
        if (!touch) {
          touch = e;
        }

        let widgetId = codeHash;
        let { target } = e;
        while (target && target.dataset) {
          const { report } = target.dataset;
          if (report && typeof report === 'string') {
            widgetId = report;
            break;
          }
          target = target.parentNode;
        }
        const pPos = context.bridge.px2Percent({
          x: touch.pageX || 0,
          y: touch.pageY || 0,
        });
        context.bridge.report({
          type: e.type,
          x: pPos.x,
          y: pPos.y,
          compid: context.nodeid,
          tplid: context.tplid,
          widgetid: widgetId,
        });
      };
    },
  },
};
