// Copyright (c) 2014 Adobe Systems Incorporated. All rights reserved.
// 
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, bitwise: true */
/*global define: true, require: true, module: true */

/* Help construct the svgOM */

(function () {
"use strict";
    
    var omgStyles = require("./svgOMGeneratorStyles.js"),
        omgUtils = require("./svgOMGeneratorUtils.js"),
        svgWriterUtils = require("./svgWriterUtils.js"),
        Matrix = require("./matrix.js"),
        round1k = svgWriterUtils.round1k,
        _boundInPx = omgUtils.boundInPx;

	function SVGOMGeneratorText() {
        
        this.textComponentOrigin = function (layer, fn) {
            if (layer.text &&
                layer.text.textStyleRange && layer.text.textStyleRange[0] &&
                layer.text.paragraphStyleRange && layer.text.paragraphStyleRange[0] &&
                layer.text.textShape && layer.text.textShape[0].char) {
                return fn(layer.text);
            }
            return false;
        };

        this._computeTextPath = function (listKey, isBoxMode, boxOrientation, bounds, textHeight) {
            
            var points,
                closedSubpath = !!listKey.closedSubpath,
                i = 0,
                pathData = '',
                controlPoint,
                lastPoint;
            
            if (isBoxMode) {
                if (boxOrientation === "horizontal") {
                    points = [listKey.points[3], listKey.points[1]];
                } else {
                    points = [listKey.points[2], listKey.points[0]];
                }
                pathData = 'M ' + round1k(points[0].anchor.horizontal.value) + ' ' + round1k(points[0].anchor.vertical.value);
                pathData += 'L ' + round1k(points[1].anchor.horizontal.value) + ' ' + round1k(points[1].anchor.vertical.value);
            } else {
                points = listKey.points;
            
                for (; points && i < points.length; ++i) {
                    if (!i) {
                        pathData = 'M ' + round1k(points[i].anchor.horizontal.value) + ' ' + round1k(points[i].anchor.vertical.value);
                    } else {
                        lastPoint = points[i-1].forward ? points[i-1].forward : points[i-1].anchor;
                        pathData += " C " + round1k(lastPoint.horizontal.value) + " " + round1k(lastPoint.vertical.value) + " ";
                        controlPoint = points[i].backward ? points[i].backward : points[i].anchor;
                        pathData += round1k(controlPoint.horizontal.value) + " " + round1k(controlPoint.vertical.value) + " ";
                        pathData += round1k(points[i].anchor.horizontal.value) + " " + round1k(points[i].anchor.vertical.value);
                    }
                }
                if (closedSubpath) {
                    pathData += " Z";
                }
            }
            
            return pathData;
        };
        
        this.addTextOnPath = function (svgNode, layer, writer) {
            var self = this;
            return this.textComponentOrigin(layer, function (text) {
                if ((layer.text.textShape[0].char !== "onACurve" &&
                     layer.text.textShape[0].char !== "box") ||
                    !layer.text.textShape[0].path) {
                    return false;
                }

                var svgTextPathNode,
                    isBoxMode = (layer.text.textShape[0].char === "box"),
                    boxOrientation = layer.text.textShape[0].orientation,
                    dpi = (writer._root && writer._root.pxToInchRatio) ? writer._root.pxToInchRatio : 72.0,
                    maxTextSize = _boundInPx(text.textStyleRange[0].textStyle.size, dpi);

                try {
                
                    svgNode.type = "text";
                    svgNode.shapeBounds = layer.bounds;

                    /*
                    svgNode.textBounds = {    
                        top: layer.bounds.top + _boundInPx(layer.text.bounds.top, dpi),
                        bottom: layer.bounds.top + _boundInPx(layer.text.bounds.bottom, dpi),
                        left: layer.bounds.left + _boundInPx(layer.text.bounds.left, dpi),
                        right: layer.bounds.left + _boundInPx(layer.text.bounds.right, dpi)    
                    };
                    */

                    svgNode.textBounds = {
                        top: _boundInPx(text.boundingBox.top, dpi),
                        bottom: _boundInPx(text.boundingBox.bottom, dpi),
                        left: _boundInPx(text.boundingBox.left, dpi),
                        right: _boundInPx(text.boundingBox.right, dpi)
                    };
                    svgNode.position = {
                        x: 0,
                        y: 0
                    };
                    writer.pushCurrent(svgNode);
                    svgTextPathNode = writer.addSVGNode(svgNode.id + "-path", "textPath", true);
                    svgTextPathNode.pathData = self._computeTextPath(layer.text.textShape[0].path.pathComponents[0].subpathListKey[0], isBoxMode, boxOrientation, svgNode.textBounds, maxTextSize);

                    self.addTextTransform(writer, svgNode, text, layer);

                    if (!self.addTextChunks(svgTextPathNode, layer, text, writer, svgNode.position, svgNode.shapeBounds, dpi)) {
                        return false;
                    }

                    omgStyles.addParagraphStyle(svgTextPathNode, text.paragraphStyleRange[0].paragraphStyle);

                    writer.popCurrent();

                    omgStyles.addTextStyle(svgNode, layer);

                    omgStyles.addStylingData(svgNode, layer, dpi);
                
                } catch (exter) {
                    console.warn(exter.stack);
                    return false;
                }
                return true;
            });
        };

        
        this.addSimpleText = function (svgNode, layer, writer) {
            var self = this;
            
            return this.textComponentOrigin(layer, function (text) {                
                
                var dpi = (writer._root && writer._root.pxToInchRatio) ? writer._root.pxToInchRatio : 72.0;
                
                // FIXME: We need to differ between "paint", "path", "box" and "warp".
                // The latter two won't be supported sufficiently enough initially.
                svgNode.type = "text";
                svgNode.shapeBounds = layer.bounds;
                svgNode.layerName = layer.name;
                
                svgNode.textBounds = JSON.parse(JSON.stringify(layer.bounds));
                
                // If the text is at the origin, we won't get a textClickPoint.
                var x = (text.textClickPoint && text.textClickPoint.horizontal) ? text.textClickPoint.horizontal.value : 0;
                var y = (text.textClickPoint && text.textClickPoint.vertical) ? text.textClickPoint.vertical.value : 0;

                // It seems that textClickPoint is a quite reliable global position for
                // the initial <text> element. 
                // Values in percentage, moving to pixels so it is easier to work with te position
                svgNode.position = {
                    x: omgUtils.pct2px(x, writer._root.docBounds.right - writer._root.docBounds.left),
                    y: omgUtils.pct2px(y, writer._root.docBounds.bottom - writer._root.docBounds.top),
                    unitX: "px",
                    unitY: "px"
                };
                
                self.addTextTransform(writer, svgNode, text, layer);

                return self.addTextChunks(svgNode, layer, text, writer, svgNode.position, svgNode.shapeBounds, dpi);
            });
        };

        this._approximatelyEqual = function(a, b, tolerance) {
            return Math.abs(a - b) < tolerance;
        };

        // Creates lines with character ranges based on vertical glyph
        // positions.
        this._createLines = function(glyphs) {
            var lines = [],
                isFirstLine = true,
                previousY = 0,
                currentLine;

            for (var i = 0; i < glyphs.length; i++) {
                var glyph = glyphs[i];
                var y = glyph.transform.ty;

                var yPositionChanged = !this._approximatelyEqual(previousY, y, 0.001);
                if (isFirstLine || yPositionChanged) {
                    // Finish the current line.
                    if (currentLine) {
                        currentLine.to = i;
                    }

                    // Start a new line.
                    currentLine = {
                        from: i,
                        to: i,
                        y: y
                    };
                    lines.push(currentLine);

                    isFirstLine = false;
                }

                previousY = y;
            };

            // Finish the last line because we won't see a y position change
            // after the last character.
            if (currentLine) {
                currentLine.to = i;
            }

            return lines;
        };

        // There seems to be a PS bug in which we get 2 identical
        // textStyleRanges next to each other with a test case like:
        // "0<hard wrap>123<soft wrap>4 56",
        // where the "5" has a different text color.
        this._ensureUniqueRanges = function(ranges) {
            var seenRanges = {};
            var indicesToDelete = [];
            ranges.forEach(function(range, rangeIndex) {
                var rangeKey = range.from + ' to ' + range.to;
                if (seenRanges[rangeKey]) {
                    indicesToDelete.push(rangeIndex);
                }
                seenRanges[rangeKey] = true;
            });
            indicesToDelete.forEach(function(indexToDelete) {
                ranges.splice(indexToDelete, 1);
            });
        };

        // Adds a segments array to each line. Each segement references a
        // paragraph style and a text/span style.
        this._addLineSegments = function(lines, textString, paragraphs, spans, glyphs) {
            var from = 0;
            var paragraphIndex = 0;
            var spanIndex = 0;

            lines.forEach(function(line) {
                line.segments = [];
                while (true) {
                    var paragraph = paragraphs[paragraphIndex];
                    var span = spans[spanIndex];

                    var to = Math.min(line.to, paragraph.to, span.to);

                    line.segments.push({
                        from: from,
                        to: to,
                        // Strip out newlines.
                        textContent: textString.substring(from, to).replace("\r",""),
                        x: glyphs[from].transform.tx,
                        paragraphStyle: paragraph.paragraphStyle,
                        span: span
                    });

                    from = to;

                    if (from == paragraph.to) {
                        paragraphIndex++;
                    }
                    if (from == span.to) {
                        spanIndex++;
                    }
                    if (from == line.to) {
                        break;
                    }
                }

                // Add a hyphen to the last segment of the line if necessary.
                // Look at the raw text content, without the newlines removed.
                var lastSegment = line.segments[line.segments.length - 1];

                var rawTextContent = textString.substring(lastSegment.from, lastSegment.to);
                var endsWithNonWhitespace = /[^\s]$/.test(rawTextContent);

                var followingTextContent = textString.substring(lastSegment.to);
                var nextLineStartsWithNonWhitespace = /^[^\s]/.test(followingTextContent);

                if (endsWithNonWhitespace && nextLineStartsWithNonWhitespace) {
                    lastSegment.textContent += "-";
                }
            });
        };

        this._writeSVGOMWithLines = function(lines, svgNode, layer, text, writer, position, bounds, dpi) {
            var offset = {
                x: -_boundInPx(text.bounds.left, dpi),
                y: -_boundInPx(text.boundingBox.top, dpi)
            };

            writer.pushCurrent(svgNode);

            lines.forEach(function(line, lineIndex) {
                var segments = line.segments,
                    lineId = svgNode.id + "-" + lineIndex,
                    svgLineNode = writer.addSVGNode(lineId, "tspan", true);

                // Line with one segment.
                if (segments.length == 1) {
                    var segment = segments[0];

                    svgLineNode.text = segment.textContent;
                    svgLineNode.position = {
                        x: segment.x + offset.x,
                        y: line.y + offset.y,
                        unitX: "px",
                        unitY: "px"
                    };

                    omgStyles.addParagraphStyle(svgLineNode, segment.paragraphStyle);
                    omgStyles.addTextChunkStyle(svgLineNode, segment.span);
                    return;
                }

                // Line with multiple segments.
                svgLineNode.position = {
                    y: line.y + offset.y,
                    unitY: "px"
                };
                writer.pushCurrent(svgLineNode);

                segments.forEach(function(segment, segmentIndex) {
                    var segmentId = lineId + "-" + segmentIndex;
                    var svgSegmentNode = writer.addSVGNode(segmentId, "tspan", true);
                    svgSegmentNode.text = segment.textContent;
                    svgSegmentNode.position = {
                        x: segment.x + offset.x,
                        unitX: "px",
                    };

                    omgStyles.addParagraphStyle(svgSegmentNode, segment.paragraphStyle);
                    omgStyles.addTextChunkStyle(svgSegmentNode, segment.span);
                });

                // Pop svgLineNode.
                writer.popCurrent();
            });

            omgStyles.addTextStyle(svgNode, layer);
            omgStyles.addStylingData(svgNode, layer, dpi);

            // Pop svgNode.
            writer.popCurrent();
        };

        this.addTextChunks = function (svgNode, layer, text, writer, position, bounds, dpi) {
            var textString = text.textKey,
                paragraphs = text.paragraphStyleRange,
                spans = text.textStyleRange,
                glyphs = text.glyphs;

            // Sanitize our input a little bit.
            this._ensureUniqueRanges(paragraphs);
            this._ensureUniqueRanges(spans);

            // Create lines with styled segments out of our input.
            var lines = this._createLines(glyphs);
            this._addLineSegments(lines, textString, paragraphs, spans, glyphs);
            console.log(JSON.stringify(lines, null, 2));

            // Turn the lines into an SVG OM.
            this._writeSVGOMWithLines(lines, svgNode, layer, text, writer, position, bounds, dpi);

            return true;
        }

        this.addTextTransform = function (writer, svgNode, text, layer) {
            if (!text.transform && (!text.textShape || text.textShape.length === 0 || !text.textShape[0].transform)) {
                return;
            }
            var transform = text.transform || text.textShape[0].transform,
                dpi = (writer._root && writer._root.pxToInchRatio) ? writer._root.pxToInchRatio : 72.0,
                // The trnasformation matrix is relative to this boundaries.
                boundsOrig = layer.bounds,
                // This covers the actual bounds of the text in pt units and needs
                // to be transformed to pixel.
                boundsTransform = {
                    left:   _boundInPx(text.bounds.left, dpi),
                    right:  _boundInPx(text.bounds.right, dpi),
                    top:    _boundInPx(text.bounds.top, dpi),
                    bottom: _boundInPx(text.bounds.bottom, dpi)
                },
                inMatrix,
                matrix4x4;
            
            svgNode.maxTextSize = _boundInPx(text.textStyleRange[0].textStyle.size, dpi);
            
            if (transform) {
                inMatrix = [
                    [transform.xx, transform.xy, 0, 0],
                    [transform.yx, transform.yy, 0, 0],
                    [0, 0, 1, 0],
                    [transform.tx, transform.ty, 0, 1]
                ];
                
                if (!Matrix.containsOnlyTranslate(inMatrix)) {
                
                    matrix4x4 = Matrix.createMatrix(inMatrix);
                    
                    svgNode.transform = matrix4x4;
                    svgNode.transformTX = svgNode.position.x;
                    svgNode.transformTY = svgNode.position.y;
                    
                    svgNode.position = {
                        x: 0,
                        y: 0,
                        unitY: "px",
                        unitX: "px"
                    };
                }
            }
        };

        this.addTextData = function(svgNode, layer, writer) {
            if (this.addTextOnPath(svgNode, layer, writer) ||
                this.addSimpleText(svgNode, layer, writer)) {
                return true;
            }
            console.log("Error: No text data added for " + JSON.stringify(layer));
            return false;
        };
	}

	module.exports = new SVGOMGeneratorText();
    
}());
     
    