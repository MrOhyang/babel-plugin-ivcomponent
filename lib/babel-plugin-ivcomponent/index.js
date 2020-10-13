const fs = require('fs');
const path = require('path');
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

const mixinTemplateUrl = path.join(__dirname, './mixinTemplate.js');
const mixinTemplate = fs.readFileSync(mixinTemplateUrl, { encoding: 'utf-8' });

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
      t.identifier('props'), //
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
    t.identifier('mixins'), //
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

    code = mixinTemplate + code;

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
