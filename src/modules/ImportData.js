import { gql } from 'apollo-server'
import { dynamoTables as dt } from '../config/constants'
import request from 'request-promise-native'
import moment from 'moment'

// fixme: move to safer place
const LambdaFuncPath = 'https://z5wcxm5bv3.execute-api.ca-central-1.amazonaws.com/Prod/export'
// const LambdaFuncPath = 'http://127.0.0.1:3000/export'

const validImportTypes = ['fuel', 'propane']

export const typeDef = gql`
extend type Mutation {
  importData(dateStart: String!, dateEnd: String!, importType: String!): ImportData
}
extend type Query {
  importLog(importType: String!): [ImportData]
}
type ImportData {
  dateStart: String
  dateEnd: String
  importDate: String
  importType: String
  recordQty: Int
}
`

export const resolvers = {
  Mutation: {
    importData: (_, { dateStart, dateEnd, importType }, { user }) => {
      const dates = validateDates(dateStart, dateEnd)
      if (!dates) {
        return null
      }
      if (!validateType(importType)) {
        return null
      }
      return importFuel(dates, importType, user)
    },
  },
  Query: {
    importLog: (_, { importType }, { db }) => {
      return fetchImports(importType, db)
    },
  },
}

const importFuel = (dates, importType, user) => {

  // console.log('user: ', user)
  let options = {
    uri: LambdaFuncPath,
    headers: {
        'Authorization': `${user.accessToken}`,
    },
    method: 'POST',
    json: {
      exportType: importType,
      dateStart:  dates.startDate,
      dateEnd:    dates.endDate,
    },
  }

  return request(options).then(body => {
    return {
      dateStart:  body.DateStart,
      dateEnd:    body.DateEnd,
      recordQty:  body.RecordQty,
      importType: body.ImportType,
      importDate: body.ImportDate,
    }
  })
}

export const fetchImports = (importType, db) => {

  const params = {
    ExpressionAttributeValues: {
      ':importType':  {S: importType},
    },
    KeyConditionExpression: 'ImportType = :importType',
    Limit: 40,
    ProjectionExpression: 'DateStart, DateEnd, ImportDate, ImportType, RecordQty',
    ScanIndexForward: false,
    TableName: dt.IMPORT_LOG,
  }

  return db.query(params).promise().then(result => {

    let res = []
    result.Items.forEach(ele => {
      res.push({
        dateStart:  ele.DateStart.S,
        dateEnd:    ele.DateEnd.S,
        importDate: ele.ImportDate.S,
        importType: ele.ImportType.S,
        recordQty:  ele.RecordQty.N,
      })
    })

    return res
  })
}

// ========================= Helper Functions ========================= //

const validateDates = (startDate, endDate) => {

  const stDteValid = moment(startDate).isValid()
  const enDteValid = moment(endDate).isValid()
  if (!stDteValid || !enDteValid) {
    console.error('ERROR: Invalid start or end date') // eslint-disable-line
    return false
  }

  return {
    startDate: moment(startDate).format('YYYY-MM-DD'),
    endDate: moment(endDate).format('YYYY-MM-DD'),
  }
}

const validateType = type => {
  if (!validImportTypes.includes(type)) {
    console.error('ERROR: Invalid import type requested') // eslint-disable-line
    return false
  }
  return type
}