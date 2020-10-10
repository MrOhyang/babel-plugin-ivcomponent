const t = require('@babel/types');
const template = require('@babel/template').default;
const generate = require('@babel/generator').default;
const babelParser = require('@babel/parser');

const getVueFileName = (filepath) => {
  let filename = /(\w+)\.vue$/.exec(filepath);
  if (filename) {
    [, filename] = filename;
  }

  return filename;
};

const getMixinTmpl = () => {
  const mixinTmpl = `
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
        show(isChildRect = false) {
          if (this.visible) return;
          this.visible = true;
          this.updateRect(isChildRect);
          if (this.root === 'true') {
            this.bridge.invoke('engine', 'showInteract')
          }
        },
        hide(isChildRect = false) {
          if (!this.visible) return;
          this.visible = false;
          this.updateRect(isChildRect);
          if (this.root === 'true') {
            this.$nextTick(() => {
              this.bridge.invoke('engine', 'hideInteract');
            });
          }
        },
        updateRect(isChildRect = false) {
          console.log('HADESHE updateRect window.$$miniprogram: ', window.$$miniprogram);
          if (window.$$miniprogram) {
            // 如果是小程序，则不执行
            return ;
          }

          this.$nextTick(() => {
            // 获取 .video-size-wrap 下所有组件，取出最大的范围
            let minLeft = Infinity;
            let minTop = Infinity;
            let maxRight = -Infinity;
            let maxBottom = -Infinity;
            const BORDER = 5;
            const childList = document.querySelector('.video-size-wrap').children;
            for (let i = 0; i < childList.length; i++) {
              let child = childList[i];
              if (isChildRect) {
                child = child.firstElementChild;
                if (!child) {
                  continue;
                }
              }
              const { left, top, right, bottom } = child.getBoundingClientRect();
              minLeft = left < minLeft ? left : minLeft;
              minTop = top < minTop ? top : minTop;
              maxRight = right > maxRight ? right : maxRight;
              maxBottom = bottom > maxBottom ? bottom : maxBottom;
            }
            if (minLeft !== 0) minLeft -= BORDER;
            if (minTop !== 0) minTop -= BORDER;
            if (maxRight !== 0) maxRight += BORDER;
            if (maxBottom !== 0) maxBottom += BORDER;
            this.bridge.invoke('engine', 'fetch', {
              keyword: 'callback',
              methodName: 'setWebviewRects',
              data: [{ left: minLeft, top: minTop, right: maxRight, bottom: maxBottom }],
            });
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
  `;
  return mixinTmpl;
};

const getAstDefaultPropsProperties = () => {
  const defaultPropsTmpl = `const defaultProps = {
    x: {
      type: Number,
      default: 0,
    },
    y: {
      type: Number,
      default: 0,
    },
    width: {
      type: Number,
      default: 10,
    },
    height: {
      type: Number,
      default: 5,
    },
    startTime: {
      type: Number,
      default: 0,
    },
    endTime: {
      type: Number,
      default: 0,
    },
  }`;

  return template.ast(defaultPropsTmpl).declarations[0].init.properties;
};

const addDefualtProps = (path) => {
  const { properties } = path.node.declaration;

  let propsPerperties = properties.find(item => item.key.name === 'props');

  if (!propsPerperties) {
    // 如果没有定义 props 属性，手动添加 props: {}
    propsPerperties = t.objectProperty(
      t.identifier('props'),
      t.objectExpression([]),
    );
    properties.push(propsPerperties);
  }

  const astDefaultPropsProperties = getAstDefaultPropsProperties();

  propsPerperties.value.properties.push(...astDefaultPropsProperties);
};

const addMixin = (path) => {
  const { properties } = path.node.declaration;

  let mixinsProperty = properties.find(item => item.key.name === 'mixins');
  if (mixinsProperty) {
    throw new ReferenceError('组件不允许使用 mixins 属性');
  }

  mixinsProperty = t.objectProperty(
    t.identifier('mixins'),
    t.arrayExpression([t.identifier('mixin')]),
  );

  properties.push(mixinsProperty);
};

const visitor = {
  ExportDefaultDeclaration(path) {
    const vueFileName = getVueFileName(this.filename);
    if (!vueFileName) {
      return;
    }

    // 只处理 export default {} 这种情况
    if (path.node.declaration.type !== 'ObjectExpression') {
      return;
    }

    addDefualtProps(path);

    addMixin(path);

    let { code } = generate(path.node);
    const VFileName = `V${vueFileName}`;
    code = code.replace('export default', `const ${VFileName} =`);

    code = getMixinTmpl() + code;

    code += `window._interactComps = Object.assign(window._interactComps || {}, { ${VFileName} });`;
    code += `export default ${VFileName}`;

    const resultAst = babelParser.parse(code, {
      sourceType: 'module',
    });

    path.replaceWithMultiple(resultAst.program.body);
  },
  // ImportDeclaration() {
  //   throw new ReferenceError('组件不允许使用 import 语法');
  // },
};

module.exports = () => ({
  visitor,
});
