#!/usr/bin/env node
'use strict'

const {version} = require('./app/manifest.json')
const { execSync } = require('child_process')

const fileName = `releases/linda-${version}.tar.gz`
// execSync throws in case of exit code other than 0
const out = execSync(`npm run build && mkdir -p releases && tar czf ${fileName} -C app .`)
console.log('Output:', out.toString())
console.log('\x1b[34m%s\x1b[0m', `${fileName} created successfully`)
