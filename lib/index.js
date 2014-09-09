'use strict';
// var debug = require('debug')('metalsmith-navigation');
var merge = require('merge');
var path = require('path');

// var util = require('util');
// var inspect = function(obj){
//     console.log(util.inspect(obj, {
//         depth: null,
//         showHidden: true,
//         colors: true
//     }));
// };


/**
    This should be replaced by a module such as a custom lodash.sortBy build. A suitable
    module (allowing property key or simple callback) could not be found at the time of this writting
**/

/**
* Returns a (stably) sorted copy of list, ranked in ascending order by the
* results of running each value through sortBy. (derrived from underscore.js _.sortBy())
* @method arraySortBy
* @param {Array} list - array to be sorted
* @param {Function|String} sortBy - ( function(item){ return item.sort_property; } )
*    If string used as the name of the property to sort by (eg. length).
* @return {Array} copy of sorted array
*/
var arraySortBy = function(list, sortBy) {

    if(typeof sortBy !== 'function'){
        var sortByKey = sortBy;
        sortBy = function(obj){
            return obj[sortByKey];
        };
    }

    var mapped = list.map(function(value, index, list) {
        return {
            value: value,
            index: index,
            criteria: sortBy(value, index, list)
        };
    });

    var compareFunction = function(left, right) {
        var a = left.criteria,
            b = right.criteria;
        if (a !== b) {
            if (a > b || a === void 0) return 1;
            if (a < b || b === void 0) return -1;
        }
        return left.index < right.index ? -1 : 1;
    };

    mapped.sort(compareFunction);

    return mapped.map(function(item){
        return item.value;
    });
};

/**
* @method eachTreeNode
* @param {Array} tree - nav node tree
* @param {Function} callback - function(node, parent, depth), if callback returns false the node will be removed
* @return {Array} tree
*/
var eachTreeNode = function(tree, callback){
    var iterate = function(nodes, parent, depth){
        depth = (depth || 0) + 1;
        for(var i = nodes.length - 1; i >= 0; i--){
            var node = nodes[i];
            var result = callback(node, parent, depth);
            if(result === false){
                nodes.splice(i, 1);
            }
            iterate(node.children, node, depth);
        }
    };
    iterate(tree);
    return tree;
};

/**
* Convert list of files to tree structure
* @method pathsToTree
* @param {Array} paths - list of file paths to act on.
* @return Array
*/
var pathsToTree = function(paths){
    var items = [];
    for(var i = 0, l = paths.length; i < l; i++) {
        var path = paths[i];
        var name = path[0];
        var rest = path.slice(1);
        var item = null;
        for(var j = 0, m = items.length; j < m; j++) {
            if(items[j].name === name) {
                item = items[j];
                break;
            }
        }

        if(item === null) {
            item = {
                name: name,
                path: null,
                type: null,
                sort: 0,
                children: []
            };
            items.push(item);
        }
        if(rest.length > 0) {
            item.children.push(rest);
        }
    }
    for(i = 0, l = items.length; i < l; i++) {
        var node = items[i];
        node.children = pathsToTree(node.children);
    }
    return items;
};


/**
* Loop over each node and do the following:
*     set node.path - full path to file.
*     set node.type - 'file' or 'dir'.
*
* @method addNodeMetadata
* @param {Array} tree - tree of nodes to act on
* @param {Array} files - List of files being processed by metalsmith.
* @param {String} sortBy - Sort by property key.
* @return {Array} converted array (same obj as tree param)
*/
var addNodeMetadata = function(tree, files, sortBy){
    var fileList = Object.keys(files);

    eachTreeNode(tree, function(node, parent, depth){
        var path = node.name,
            type = 'dir';

        if(parent){
            path = parent.path + '/' + node.name;
        }

        if(fileList.indexOf(path) !== -1){
            type = 'file';
            var file = files[path];
            node.file = file;
            if(sortBy){
                node.sort = file[sortBy];
            }
        }

        node.path = path;
        node.type = type;
        node.depth = depth;
    });

    return tree;
};

/**
* Sort nodes recursively
* @method sortNodes
* @param {Array} nodes - tree of nodes to act on
* @param {String|Function} sortyBy -
*     If string nodes sorted by node[sortBy].
*     If function nodes sorted by function provided. Example: function(node){ return node.sortKey; }
* @return {Array} sorted node tree
*/
var sortNodes = function(tree, sortBy){
    tree = arraySortBy(tree, sortBy);
    for(var i = tree.length - 1; i >= 0; i--){
        var node = tree[i];
        if(node.children){
            sortNodes(node.children, 'sort');
        }
    }
    return tree;
};

/**
* Find dirs with a sibling with afile name matching the dir name,
* remove the dir and move child nodes from it to the matching file node
* @method mergeFileDirs
* @param {Array} tree - Tree of nodes to act on.
* @return {Array} converted array (same obj as tree param)
*/
var mergeFileDirs = function(tree){

    var merge = function(siblings){
        for (var i = siblings.length - 1; i >= 0; i--){
            var node = siblings[i];
            if(node.type === 'dir'){
                for(var j = siblings.length - 1; j >= 0; j--){
                    var sibling = siblings[j];
                    if(node !== sibling && sibling.type !== 'dir'){
                        // remove file extension
                        var siblingBaseName = sibling.path.replace(/\.[^/.]+$/, "");
                        // if dir name matches node without file extension
                        if(siblingBaseName === node.path){
                            // copy children from dir to file node and mark the dir to be removed

                            // prevent copying duplicates
                            for(var k = node.children.length - 1; k >= 0; k--){
                                var nodeChild = node.children[k];
                                if(sibling.children.indexOf(nodeChild) === -1){
                                    sibling.children.push(nodeChild);
                                }
                            }
                            var index = siblings.indexOf(node);
                                siblings.splice(index, 1);
                            break;
                        }
                    }
                }
            }
        }

        // recurse children
        for(var i = siblings.length - 1; i >= 0; i--){
            var node = siblings[i];
            if(node.children){
                merge(node.children);
            }
        }
    };

    merge(tree);
    return tree;
};

/**
* @method setFileObjectReferences
* @param {Array} tree - nav node tree
* @param {Object} files - Metalsmith files object
* @return {Array} tree
*/
var setFileObjectReferences = function(tree, files){
    eachTreeNode(tree, function(node, parent, depth){
        var path = node.path;
        if(files[path]){
            node.file = files[path];
            node.file.path = path;
        }
        node.parent = parent;
    });
    return tree;
};

/**
* @method setBreadcrumbs
* @param {Array} tree - nav node tree
* @param {String} breadcrumbProperty -
* @return {Array} tree
*/
var setBreadcrumbs = function(tree, breadcrumbProperty){
    eachTreeNode(tree, function(node, parent, depth){
        var breadcrumbPath = [];
        if(parent){
            if(parent.breadcrumbPath){
                breadcrumbPath = parent.breadcrumbPath.concat(parent);
            } else {
                breadcrumbPath = [parent];
            }
        }
        node[breadcrumbProperty] = breadcrumbPath;
        if(node.file){
            node.file[breadcrumbProperty] = breadcrumbPath;
        }
    });
    return tree;
};


/**
* @method filterFiles
* @param {Object} files - Metalsmith files object
* @param {String} key - file metadata key
* @param {String} val - file metadata key value to check for
* @return {Object} filtered files object
*/
var filterFiles = function(files, key, val){
    var out = {};
    for(var fileKey in files){
        var file = files[fileKey],
            groups = file[key];

        if(typeof groups === 'string'){
            if(groups === val){
                out[fileKey] = file;
            }
        } else if(groups && groups.indexOf(val) !== -1){
            out[fileKey] = file;
        }
    }
    return out;
};


/**
* @method transformPermalinks
* @param {Array} tree - nav nodes
* @return {Array} tree
*/
var transformPermalinks = function(tree){
    eachTreeNode(tree, function(node, parent, depth){
        if(node.file){
            if(node.depth > 1){
                if(!node.children || !node.children.length){
                    node.path = path.dirname(node.path);
                    node.parent.path = node.path;
                    node.parent.file = node.file;
                    node.parent.add_trailing = true;
                }
                return false;
            }
        }
    });
    return tree;
};

/*
* @method removeDirs
* @param {Array} tree - nav nodes
* @return {Array} tree
*/
var removeDirs = function(tree){
    eachTreeNode(tree, function(node, parent, depth){
        if(node.type === 'dir'){
            return false;
        }
    });
    return tree;
};

/**
* @method getNav
* @param {Object} config - A nav config object
* @param {Object} files - metalsmith files plugin param
* @return {Array} nav tree
*/
var getNav = function(config, files){
    var filesList = Object.keys(files),
        sortByNameFirst             = config.sortByNameFirst,
        sortBy                      = config.sortBy,
        breadcrumbs                 = config.breadcrumbs,
        breadcrumbProperty          = config.breadcrumbProperty,
        mergeMatchingFilesAndDirs   = config.mergeMatchingFilesAndDirs,
        includeDirs                 = config.includeDirs;

    var paths = filesList.map(function(path) {
        return path.split('/');
    });

    var nodes = pathsToTree(paths);

    nodes = addNodeMetadata(nodes, files);

    if(mergeMatchingFilesAndDirs){
        nodes = mergeFileDirs(nodes);
    } else if(!includeDirs){
        nodes = removeDirs(nodes);
    }

    nodes = setFileObjectReferences(nodes, files);

    if(breadcrumbs){
        nodes = setBreadcrumbs(nodes, breadcrumbProperty);
    }

    if(sortByNameFirst){
        nodes = sortNodes(nodes, 'path');
    }

    if(sortBy){
        nodes = sortNodes(nodes, sortBy);
    }

    return nodes;
};

/**
* @method plugin
* @param {Object} navConfigs - list of nav config objects indexed by name
* @param {Object} settings - list of non nav specific plugin settings
* @return {Function}
*/
var plugin = function plugin(navConfigs, settings){
    navConfigs = navConfigs || {};
    settings = settings || {};

    var defaultSettings = {

        /*
        * metadata key all navs will be assigned to metatdata[navListProperty]
        * not set if false
        */
        navListProperty: 'navs',

        /*
        * if true, paths will be transformed to use metalsmith-permalinks
        * metalsmith-permalinks must be run before metalsmith-navigation
        */
        permalinks: false,
    };

    settings = merge(defaultSettings, settings);

    var navListProperty = settings.navListProperty;
    var permalinks = settings.permalinks;

    var defaultNavConfig = {

        /*
        * sortby function or property name
        * function example: function(navNode){ return navNode.getValueToSortBy(); }
        */
        sortBy: false,

        /*
        * if true nodes will be sorted by path before sortBy
        * if false the sorting will not be stable unless ALL nodes have a unique sort value
        */
        sortByNameFirst: true,

        /*
        * to be included in this nav config, a file's metadata[filterProperty] must equal filterValue
        * ex:
        *   navConfigs key = 'footer'
        *   filterProperty = 'nav_group'
        *   files only added if files[path].nav_group == 'footer'
        */
        filterProperty: false,

        /*
        * if false nav name (navConfigs key) used instead
        * if files[path][filterProperty] equals or contains (string or array containing) filterValue
        * it will be included
        */
        filterValue: false,

        /*
        * if breadcrumb path data should begenerated and assigned to file objects
        * typically only one navConfig should generate breadcrumbs, often one specifically for them
        */
        breadcrumbs: true,

        /*
        * the file object property that breadcrumb array is assigned to on each file object
        */
        breadcrumbProperty: 'breadcrumbPath',

        /*
        * if a file and sibling dir have matching names the file will be used as the parent in the nav tree
        * ex: /foo /foo.html
        */
        mergeMatchingFilesAndDirs: true,

        /*
        * if dirs should be included as nav nodes
        * has no effect if mergeMatchingFilesAndDirs = true
        */
        includeDirs: true,

    };

    // merge nav configs with defaults
    for(var key in navConfigs){
        var navConfig = navConfigs[key];
        navConfigs[key] = merge(defaultNavConfig, navConfig);
    }

    return function(files, metalsmith, done){

        var metadata = metalsmith.metadata();

        if(navListProperty){
            metadata[navListProperty] = {};
        }

        // key is the name of the nav
        for(var key in navConfigs){

            var config = navConfigs[key],
                navFiles = files,
                filterProperty = config.filterProperty,
                filterValue = config.filterValue || key;

            // filter to files that match the filterProperty and filterValue
            if(filterProperty){
                navFiles = filterFiles(files, filterProperty, filterValue);
            }

            // get processed nav
            var nav = getNav(config, navFiles);

            // apply permalinks if set in settings
            if(permalinks){
                nav = transformPermalinks(nav);
            }

            // add to global metadata
            if(navListProperty){
                metadata[navListProperty][key] = nav;
            }

            // inspect(nav);
        }

        // console.log(Object.keys(metadata[navListProperty]));

        // var logNav = function(nodes, depth){
        //     depth = depth || 1;

        //     var tab = '';

        //     for(var i = depth - 1; i >= 0; i--){
        //         tab += ' ';
        //     }
        //     for (var i = 0; i < nodes.length; i++) {
        //         var node = nodes[i];
        //         console.log(tab + '- ' + node.path);

        //         if(node.children){
        //             logNav(node.children, depth + 1);
        //         }
        //     }
        // };

        // for(var key in metadata[navListProperty]){
        //     var n = metadata[navListProperty][key];

        //     console.log('nav', key);

        //     logNav(n);
        // }
        done();
    };
};

module.exports = plugin;