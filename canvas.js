(() => {
    "use strict"

    const get = HTMLCanvasElement.prototype.getContext
    const map = Map

    HTMLCanvasElement.prototype.getContext = function(id, options) {
        const canvas = this

        if (id == "2d") {
            const options = {preserveDrawingBuffer: true}
            const gl = get.call(canvas, "webgl", options) || get.call(canvas, "experimental-webgl", options)

            if (gl) {
                const render = (x = 0, y = 0, w = 1, h = 1) => {
                    const matrix = [w, 0, 0, 0, h, 0, x, y, 1]
                    gl.uniformMatrix3fv(uniform.obj, false, matrix)
                }

                const refresh = () => {
                    gl.uniformMatrix3fv(uniform.view, false, [2 / canvas.width, 0, 0, 0, 2 / -canvas.height, 0, -1, 1, -1])

                    for (const name in data.attrib)
                        data.attrib[name].value = data.attrib[name].reset

                    data.fill = color(data.attrib.fill.value)
                    data.stroke = color(data.attrib.stroke.value)
                }

                const transform = () => gl.uniformMatrix3fv(uniform.ctx, false, [
                    data.mat.a, data.mat.b, 0,
                    data.mat.c, data.mat.d, 0,
                    data.mat.e, data.mat.f, 1
                ])

                const color = value => {
                    if (value.at() == "#") {
                        const int = parseInt(value.substring(1), 16)
                        return [(int >> 16) / 0xff, ((int >> 8) & 0xff) / 0xff, (int & 0xff) / 0xff, 1]
                    }

                    else {
                        const [r, g, b, a] = value.replace(/[^\d,.]/g, "").split(",").map(Number)
                        return [r / 0xff, g / 0xff, b / 0xff, a]
                    }
                }

                const rect = () => {
                    gl.bindBuffer(gl.ARRAY_BUFFER, cube)
                    gl.vertexAttribPointer(0, 2, gl.UNSIGNED_BYTE, false, 0, 0)
                    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
                }

                const resize = () => {
                    refresh()
                    gl.viewport(0, 0, canvas.width, canvas.height)
                }

                const norm = (x, y) => {
                    const length = Math.hypot(x, y)
                    return [(x / length) || 0, (y / length) || 0]
                }

                const define = name => {
                    const descriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, name)

                    Object.defineProperty(canvas, name, {
                        get: descriptor.get,

                        set: function(value) {
                            descriptor.set.call(this, value)
                            resize()
                        }
                    })
                }

                const stroke = paths => {
                    const vertices = []
                    const indices = []

                    for (const path of paths) {
                        const length = vertices.length / 2

                        path.length > 1 && path.forEach((point, i) => {
                            const [x, y] = point

                            const [prevX, prevY, nextX, nextY] = (() => {
                                const [px, py] = path.at(i - 1)
                                const [nx, ny] = path[(i + 1) % path.length]

                                if (!path.closed) {
                                    if (!i) {
                                        const [vx, vy] = norm(x - nx, y - ny)
                                        return [x + vx, y + vy, nx, ny]
                                    }

                                    if (i == path.length - 1) {
                                        const [vx, vy] = norm(x - px, y - py)
                                        return [px, py, x + vx, y + vy]
                                    }
                                }

                                return [px, py, nx, ny]
                            })()

                            const ax = x - prevX, ay = y - prevY, bx = nextX - x, by = nextY - y
                            const [anx, any] = norm(ax, ay)
                            const [bnx, bny] = norm(bx, by)

                            const [tanX, tanY] = norm(anx + bnx, any + bny)
                            const [pointX, pointY] = norm(anx - bnx, any - bny)

                            const miterX = -tanY, miterY = tanX, normX = -any, normY = anx
                            const inside = miterX * pointX + miterY * pointY > 0
                            const dot = miterX * normX + miterY * normY
                            const line = data.attrib.line.value / 2 * (inside ? 1 : -1)

                            const leftX = normX * line, leftY = normY * line
                            const rightX = -(normX - 2 * dot * miterX) * line, rightY = -(normY - 2 * dot * miterY) * line
                            const midX = miterX * line / dot, midY = miterY * line / dot

                            const miter = data.attrib.join.value == "miter" && 1 / dot < data.attrib.miter.value
                            const near = miter ? [x + midX, y + midY] : [x + leftX, y + leftY]
                            const far = [x - leftX, y - leftY]
                            const array = inside ? far.concat(near) : near.concat(far)
                            const base = vertices.length / 2

                            vertices.push(...array)

                            if (i < path.length - 1 || path.closed) {
                                const e = i == path.length - 1

                                if (miter)
                                    indices.push(
                                        base + inside, base + 2, e ? length : base + 3,
                                        base + 1 + !inside, e ? length : base + 3, e ? length + 1 : base + 4)

                                else {
                                    indices.push(
                                        base + 4, base + 2, e ? length + 1 : base + 6,
                                        base + 2 + inside * 2, e ? length + 1 : base + 5, e ? length : base + 6,
                                        base + inside, base + 2, base + 3)

                                    vertices.push(x + rightX, y + rightY, x, y)
                                }

                                vertices.push(x - rightX, y - rightY)
                            }
                        })
                    }

                    render()
                    gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
                    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo)

                    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW)
                    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.DYNAMIC_DRAW)
                    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
                    gl.uniform1i(uniform.img, 0)

                    gl.enable(gl.DEPTH_TEST)
                    gl.clear(gl.DEPTH_BUFFER_BIT)
                    gl.colorMask(false, false, false, false)

                    gl.uniform4fv(uniform.color, data.stroke)
                    gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0)

                    gl.colorMask(true, true, true, true)
                    gl.depthFunc(gl.LEQUAL)
                    gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0)
                    gl.disable(gl.DEPTH_TEST)
                }

                const normalize = (name, before, after) => {
                    ctx[name] = before
                    ctx[name] = after
                    return ctx[name]
                }

                const vertex = gl.createShader(gl.VERTEX_SHADER)
                const fragment = gl.createShader(gl.FRAGMENT_SHADER)
                const program = gl.createProgram()

                const cube = gl.createBuffer()
                const vbo = gl.createBuffer()
                const ibo = gl.createBuffer()

                const ctx = get.call(document.createElement("canvas"), "2d")
                const uniform = {}

                const data = {
                    attrib: {
                        fill: {reset: "#000000"},
                        stroke: {reset: "#000000"},
                        font: {reset: "10px sans-serif"},
                        text: {reset: "start"},
                        join: {reset: "miter"},
                        alias: {reset: true},
                        miter: {reset: 10},
                        line: {reset: 1}
                    },

                    mat: {a: 1, b: 0, c: 0, d: 1, e: 0, f: 0},
                    images: new map(),
                    path: []
                }

                gl.shaderSource(vertex,
                    "attribute vec2 vert;" +
                    "varying vec2 pos;" +

                    "uniform mat3 view;" +
                    "uniform mat3 obj;" +
                    "uniform mat3 ctx;" +

                    "void main() {" +
                        "vec3 export = view * ctx * obj * vec3(vert, 1);" +
                        "gl_Position = vec4(export.xy, fract(export.x * export.y), 1);" +
                        "pos = vert;" +
                    "}")

                gl.shaderSource(fragment,
                    "precision mediump float;" +
                    "varying vec2 pos;" +

                    "uniform vec4 color;" +
                    "uniform sampler2D sampler;" +
                    "uniform int img;" +

                    "void main() {" +
                        "gl_FragColor = img == 0 ? color : texture2D(sampler, pos);" +
                    "}")

                gl.attachShader(program, vertex)
                gl.attachShader(program, fragment)
                gl.compileShader(vertex)
                gl.compileShader(fragment)

                gl.linkProgram(program)
                gl.useProgram(program)
                gl.deleteShader(vertex)
                gl.deleteShader(fragment)

                uniform.view = gl.getUniformLocation(program, "view")
                uniform.obj = gl.getUniformLocation(program, "obj")
                uniform.ctx = gl.getUniformLocation(program, "ctx")
                uniform.color = gl.getUniformLocation(program, "color")
                uniform.img = gl.getUniformLocation(program, "img")

                gl.uniform1i(gl.getUniformLocation(program, "sampler"), 0)
                gl.bindBuffer(gl.ARRAY_BUFFER, cube)
                gl.bufferData(gl.ARRAY_BUFFER, new Uint8Array([0, 1, 1, 1, 0, 0, 1, 0]), gl.STATIC_DRAW)
                gl.enableVertexAttribArray(0)

                gl.enable(gl.BLEND)
                gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

                define("width")
                define("height")

                resize()
                transform()

                return new class {
                    fillRect(x, y, w, h) {
                        gl.uniform4fv(uniform.color, data.fill)
                        gl.uniform1i(uniform.img, 0)

                        render(x, y, w, h)
                        rect()
                    }

                    clearRect(x, y, w, h) {
                        gl.enable(gl.SCISSOR_TEST)
                        gl.scissor(x + data.x, canvas.height - y - h - data.y, w, h)

                        gl.clear(gl.COLOR_BUFFER_BIT)
                        gl.disable(gl.SCISSOR_TEST)
                    }

                    translate(x, y) {
                        data.mat.e += x * data.mat.a + y * data.mat.c
                        data.mat.f += x * data.mat.b + y * data.mat.d

                        transform()
                    }

                    rotate(angle) {
                        const cos = Math.cos(angle)
                        const sin = Math.sin(angle)

                        const a = cos * data.mat.a + sin * data.mat.c
                        const b = cos * data.mat.b + sin * data.mat.d

                        data.mat.c = cos * data.mat.c - sin * data.mat.a
                        data.mat.d = cos * data.mat.d - sin * data.mat.b
                        data.mat.a = a
                        data.mat.b = b

                        transform()
                    }

                    transform(a, b, c, d, e, f) {
                        data.mat = {
                            a: a * data.mat.a + b * data.mat.c,
                            b: a * data.mat.b + b * data.mat.d,
                            c: c * data.mat.a + d * data.mat.c,
                            d: c * data.mat.b + d * data.mat.d,
                            e: e * data.mat.a + f * data.mat.c,
                            f: e * data.mat.b + f * data.mat.d
                        }

                        transform()
                    }

                    scale(x, y) {
                        data.mat.a *= x
                        data.mat.b *= x
                        data.mat.c *= y
                        data.mat.d *= y

                        transform()
                    }

                    getTransform() {
                        return new DOMMatrix([
                            data.mat.a, data.mat.b,
                            data.mat.c, data.mat.d,
                            data.mat.e, data.mat.f
                        ])
                    }

                    setTransform(a, ...args) {
                        if (!args.length) {
                            data.mat = {a: a.a, b: a.b, c: a.c, d: a.d, e: a.e, f: a.f}
                            transform()
                        }

                        else if (args.length == 5) {
                            const [b, c, d, e, f] = args

                            data.mat.a = {a, b, c, d, e, f}
                            transform()
                        }
                    }

                    resetTransform() {
                        data.mat = {a: 1, b: 0, c: 0, d: 1, e: 0, f: 0}
                        transform()
                    }

                    fillText(text, x, y, maxWidth) {
                        const metrics = this.measureText(text)
                        const texture = gl.createTexture()
                        const left = Math.ceil(metrics.actualBoundingBoxLeft)
                        const ascent = Math.ceil(metrics.actualBoundingBoxAscent)
                        const shift = data.attrib.text.value == "center" ? .5 : data.attrib.text.value == "right" ? 1 : 0

                        const w = ctx.canvas.width = left + Math.ceil(metrics.actualBoundingBoxRight)
                        const h = ctx.canvas.height = ascent + Math.ceil(metrics.actualBoundingBoxDescent)

                        ctx.fillStyle = data.attrib.fill.value
                        ctx.font = data.attrib.font.value
                        ctx.fillText(text, left, ascent, maxWidth)

                        gl.bindTexture(gl.TEXTURE_2D, texture)
                        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
                        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
                        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)

                        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, ctx.canvas)
                        gl.uniform1i(uniform.img, 1)

                        render(x - w * shift, y - ascent, w, h)
                        rect()
                    }

                    drawImage(image, x, y, ...args) {
                        const filter = data.attrib.alias.value ? gl.LINEAR : gl.NEAREST

                        const texture = data.images.get(image) || (() => {
                            const texture = gl.createTexture()

                            gl.bindTexture(gl.TEXTURE_2D, texture)
                            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
                            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

                            try {
                                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
                            }

                            catch {
                                if (!image.crossOrigin)
                                    throw new DOMException("WebGL requires you serve your images from the same server!")

                                // TODO
                            }

                            data.images.set(image, texture)
                            return texture
                        })()

                        gl.bindTexture(gl.TEXTURE_2D, texture)
                        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
                        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
                        gl.uniform1i(uniform.img, 1)

                        if (!args.length) {
                            render(x, y, image.width, image.height)
                            rect()
                        }

                        else if (args.length == 2) {
                            render(x, y, ...args)
                            rect()
                        }

                        else if (args.length == 6)
                            console.log("Sorry, drawImage with clipping is not supported yet")
                    }

                    save() {
                        for (const name in data.attrib)
                            data.attrib[name].save = data.attrib[name].value

                        data.transform = {...data.mat}
                    }

                    restore() {
                        for (const name in data.attrib)
                            data.attrib[name].value = data.attrib[name].save

                        data.mat = {...data.transform}
                        data.fill = color(data.attrib.fill.value)
                        data.stroke = color(data.attrib.stroke.value)

                        transform()
                    }

                    beginPath() {
                        data.path = []
                    }

                    closePath() {
                        if (data.path.length) {
                            const last = data.path.at(-1)

                            last.closed = true
                            data.path.push([last.at(-1)])
                        }
                    }

                    moveTo(x, y) {
                        data.path.push([[x, y]])
                    }

                    lineTo(x, y) {
                        data.path.length ? data.path.at(-1).push([x, y]) : data.path.push([[x, y]])
                    }

                    stroke() {
                        stroke(data.path)
                    }

                    measureText(text) {
                        ctx.font = data.attrib.font.value
                        return ctx.measureText(text)
                    }

                    strokeRect(x, y, w, h) {
                        const path = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]

                        path.closed = true
                        stroke([path])
                    }

                    get canvas() {
                        return canvas
                    }

                    get font() {
                        return data.attrib.font.value
                    }

                    set font(value) {
                        data.attrib.font.value = normalize("font", data.attrib.font.value, value)
                    }

                    get fillStyle() {
                        return data.attrib.fill.value
                    }

                    set fillStyle(value) {
                        data.fill = color(data.attrib.fill.value = normalize("fillStyle", data.attrib.fill.value, value))
                    }

                    get strokeStyle() {
                        return data.attrib.stroke.value
                    }

                    set strokeStyle(value) {
                        data.stroke = color(data.attrib.stroke.value = normalize("strokeStyle", data.attrib.stroke.value, value))
                    }

                    get textAlign() {
                        return data.attrib.text.value
                    }

                    set textAlign(value) {
                        if (["start", "left", "right", "center"].includes(value))
                            data.attrib.text.value = value
                    }

                    get lineJoin() {
                        return data.attrib.join.value
                    }

                    set lineJoin(value) {
                        if (["miter", "round", "bevel"].includes(value))
                            data.attrib.join.value = value
                    }

                    get lineWidth() {
                        return data.attrib.line.value
                    }

                    set lineWidth(value) {
                        const number = Number(value)

                        if (isFinite(number) && number > 0)
                            data.attrib.line.value = number
                    }

                    get miterLimit() {
                        return data.attrib.miter.value
                    }

                    set miterLimit(value) {
                        const number = Number(value)

                        if (isFinite(number) && number > 0)
                            data.attrib.miter.value = number
                    }

                    get imageSmoothingEnabled() {
                        return data.attrib.alias.value
                    }

                    set imageSmoothingEnabled(value) {
                        data.attrib.alias.value = Boolean(value)
                    }
                }
            }

            else return get.call(canvas, "2d")
        }

        else return get.call(canvas, id, options)
    }
})()