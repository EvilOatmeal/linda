import log from './logger.js'
import {updateRows, isPruneChecked} from './ui.js'

function pick(searchParams, keys) {
  return keys.map(key => searchParams.get(key)).filter(x => !!x)
}

function getSearchParams(request) {
  if (request.method === 'GET') {
    return new URL(request.url).searchParams
  }
  if (request.postData && request.postData.text) {
    return new URLSearchParams(request.postData.text)
  }

  return new URLSearchParams()
}

class Analyzer {
  constructor() {
    this.onRequest = this.onRequest.bind(this)
    this.messages = []
    this.filterText = ''
    this.typesToFilter = new Set()
  }

  updateUi() {
    const messages = this.filterMessages()
    updateRows(messages.map(o => Object.assign({}, o, {
      filterText: this.filterText,
      prune: isPruneChecked(),
    })))
  }

  filterMessages() {
    function filterByType(messages, typesToFilter) {
      if (typesToFilter.size) {
        return messages.filter(({type}) => !typesToFilter.has(type))
      }
      return messages
    }

    function filterDetailsByText(messages, text, re) {
      if (!isPruneChecked()) return messages

      return messages.map((_message) => {
        const message = Object.assign({}, _message)
        message.details = message.details.filter((detail) => detail.join('=').match(re))
        return message
      })
    }

    function filterByText(messages, text) {
      if (!text) {
        return messages
      }

      const re = new RegExp(text, 'i')
      return filterDetailsByText(messages, text, re).filter((message) => {
        return message.details.length > 0 && message.searchParamsList.some((searchParamPair) => searchParamPair.join('=').match(re))
      })
    }

    const messagesFilteredByType = filterByType(this.messages, this.typesToFilter)
    return filterByText(messagesFilteredByType, this.filterText)
  }

  reset() {
    this.messages = []
    this.updateUi()
  }

  setFilterText(value) {
    this.filterText = value
    this.updateUi()
  }

  filterType({name, checked}) {
    if (checked) {
      this.typesToFilter.delete(name)
    } else {
      this.typesToFilter.add(name)
    }
    this.updateUi()
  }

  filterOnlyType(trackerLabels, {name}) {
    this.typesToFilter.clear()
    trackerLabels.forEach((label) => {
      const filterName = label.getElementsByTagName('input')[0].name

      if (filterName !== name) {
        this.typesToFilter.add(filterName)
      }
    })

    this.updateUi()
  }

  newMessage({type, summary, searchParamsList}) {
    this.messages.push({
      type,
      searchParamsList,
      // short and long processed here to send to accordion ui directly
      summary,
      details: searchParamsList
    })
    this.updateUi()
  }

  handleRequest(_request) {
    console.log(_request) // eslint-disable-line no-console
    const {request, response} = _request
    const url = request.url
    const searchParams = getSearchParams(request)
    const searchParamsList = Array.from(searchParams.entries())
    const {status} = response

    if (url.match(/\.scorecardresearch\.com/)) {
      if (status !== 200) return
      const type = 'MMS'

      // ns_st_ty = video type  – video, advertisement
      // ns_st_ev = event type  – play, pause, end, hb. MMS sends itself listening after video
      // ns_st_ad =	ad type     – preroll, postroll

      const mmsAdType = searchParams.get('ns_st_ad')
      const mmsType = searchParams.get('ns_st_ty')
      const props = pick(searchParams, ['ns_st_ev', 'mms_campaignid', 'mms_customadid'])

      props.unshift(mmsAdType || mmsType)

      const summary = `${this.renderType(type)} ${props.join(':')}`
      this.newMessage({type, summary, status, searchParamsList})
    } else if (url.match(/https:\/\/www\.google-analytics\.com(\/r)?\/collect/)) {
      const type = 'GA'
      const props = pick(searchParams, ['t', 'ec', 'ea', 'cd35', 'el'])
      const summary = `${this.renderType(type)} ${props.join(':')}`
      this.newMessage({type, summary, status, searchParamsList})
    } else if (url.match(/https?:\/\/trafficgateway.research-int.se\//)) {
      const type = 'SIFO'
      const props = pick(searchParams, ['cp'])
      const summary = `${this.renderType(type)} ${props.join(':')}`
      this.newMessage({type, summary, status, searchParamsList})
    } else if (url.match(/https?:\/\/..\.lp4\.io\//)) {
      const type = 'LP'
      const props = pick(searchParams, ['ps'])
      const path = url.match(/\/[a-z]+\?/)[0].replace(/[^a-z]/g, '')

      switch (path) {
        case 'p':
          props.unshift('pageview')
          break
        case 'pl':
          props.unshift('pageload')
          break
        case 'c':
          props.unshift('click')
          break
        case 'is':
          props.unshift('inscreen')
          break
        case 'u':
          props.unshift('unique users')
          break
        case 'v':
          props.unshift('video')
          break
      }
      const summary = `${this.renderType(type)} ${props.join(':')}`
      this.newMessage({type, summary, status, searchParamsList})
    } else if (url.match(/https:\/\/jtp.expressen.se/)) {
      const type = 'JTP'
      const trackingType = url.slice(url.indexOf('/notify/') + 8, url.indexOf('.gif'))
      const summary = `${this.renderType(type)} ${trackingType}`

      this.newMessage({type, summary, status, searchParamsList})
    } else if (url.match(/pixel\.parsely\.com/)) {
      const type = 'PLY'
      const action = pick(searchParams, ['action'])[0]
      const summary = `${this.renderType(type)} ${action}`
      this.newMessage({type, summary, status, searchParamsList})
    }
  }

  renderType(type) {
    return `<span class="tracker-type">${type}</span>`
  }

  onRequest(request) {
    try {
      this.handleRequest(request)
    } catch (e) {
      log('Unexpected error:', e.message, e.stack)
    }
  }

  init() {
    log('Init!')
    if (!chrome.devtools) {
      return this._mock()
    }
    chrome.devtools.network.onRequestFinished.addListener(this.onRequest)
  }

  _mock() {
    const requests = require('./mockRequests')
    requests.forEach((r, i) => {
      setTimeout(() => this.onRequest(r), (1000 * i) - (i * i * 50))
    })
  }
}
export default new Analyzer()
