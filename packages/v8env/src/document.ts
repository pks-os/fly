/**
 * @module fly
 * @private
 */
import * as htmlparser from "htmlparser2"

import {
  getOuterHTML,
  getText,
  getInnerHTML,
  replaceElement,
  getAttributeValue,
  appendChild
} from "domutils"

import { logger } from "./logger"

const WritableParser = htmlparser.WritableStream

import * as css from "css-select"

export class Node {
  protected _dom: any

  constructor(dom) {
    this._dom = dom
  }

  public querySelector(selector) {
    const found = css.selectOne(selector, this._dom)
    if (!found) { return null }
    return new Element(this._withParent(found))
  }

  public querySelectorAll(selector) {
    return css.selectAll(selector, this._dom).map(d => new Element(this._withParent(d)))
  }

  public _withParent(node) {
    node.parent || (node.parent = this)
    return node
  }

  set children(children) {
    this._dom = children
  }

  get children() {
    return this._dom
  }

  public appendChild(html) {
    if (typeof html._dom !== "undefined") {
      // Document
      if (Array.isArray(this._dom)) { appendChild(this._dom[1], html._dom) }
      else { appendChild(this._dom, html._dom) }
      return html
    }
    html = new Element(parseDOMSync(html)[0])
    return this.appendChild(html)
  }
}

export class Document extends Node {
  public static Parser: any

  constructor(dom) {
    super(dom)
  }

  public getElementById(id) {
    return this.querySelector(`#${id}`)
  }

  get documentElement() {
    return new Element(this._dom)
  }

  public createElement(tagName) {
    return new Element(parseDOMSync(`<${tagName}></${tagName}>`)[0])
  }

  public static parse(html) {
    return new Document(parseDOMSync(html))
  }
}

export class Element extends Node {
  constructor(dom) {
    super(dom)
  }

  get id() {
    return this._dom.id
  }

  get textContent() {
    return getText(this._dom)
  }

  get innerHTML() {
    return getInnerHTML(this._dom)
  }
  get outerHTML() {
    return getOuterHTML(this._dom)
  }

  public replaceWith(html) {
    if (html instanceof Element) {
      replaceElement(this._dom, html._dom)
      return
    }
    replaceElement(this._dom, parseDOMSync(html)[0])
  }

  public getAttribute(name) {
    return getAttributeValue(this._dom, name)
  }

  public setAttribute(name, value) {
    this._dom.attribs[name] = value
  }
}

class DocumentParser {
  public parser: any
  public selectors: any

  constructor() {
    this.parser = parseDOMStreaming(this.onElement.bind(this))
    this.selectors = []
  }
  public querySelector(selector, callback) {
    this.selectors.push({
      fn: css.compile(selector),
      callback
    })
  }
  public onElement(elem) {
    const found = this.selectors.find(s => s.fn(elem))
    if (found) { found.callback(new Element(elem)) }
  }
  public async parse(stream) {
    let fullyRead = false

    if (stream instanceof ReadableStream) { stream = stream.getReader() }
    else { return this.parseSync(stream) }

    while (!fullyRead) {
      const { done, value } = await stream.read()
      if (done) {
        fullyRead = true
        break
      }
      this.parser.write(value)
    }
    this.parser.end()
  }

  public parseSync(arg: any) {
    // TODO: this method wasn't declared prior to the move to TS but referred from the parse
    // method if stream is a string. This might be an overlooked bug, will fix once we know
    // the desired behavior
    throw new Error("This wasn't a method before TS, wtf?")
  }
}

Document.Parser = DocumentParser

function parseDOMSync(html) {
  const handler = new htmlparser.DomHandler()
  new htmlparser.Parser(handler).end(html)
  return handler.dom
}

function parseDOMStreaming(elemCb) {
  const handler = new htmlparser.DomHandler(
    () => {
      logger.debug("done parsing dom")
    },
    undefined,
    elem => {
      logger.debug("got an element!", elem.attribs)
      elemCb(elem)
    }
  )
  return new WritableParser(handler)
}
