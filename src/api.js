const { config } = require('dotenv')
const { join } = require('path')
const { ok } = require('assert')

const env = process.env.NODE_ENV || "dev"
ok(env === "prod" || env === "dev", "The Env is invalid, or dev or prod")

const configPath = join(__dirname, './config', `.env.${env}`)

config({
    path: configPath
})


const Hapi = require('@hapi/hapi')
const Context = require('./db/strategies/base/contextStrategy')
const MongoDb = require('./db/strategies/mongodb/mongodb')
const HeroSchema = require('./db/strategies/mongodb/schemas/heroesSchema')
const HeroRoutes = require('./routes/heroRoutes')
const AuthRoutes = require('./routes/authRotes')
const Joi = require('joi')

const Postgres = require('./db/strategies/postgres/postgres')
const userSchema = require('./db/strategies/postgres/schemas/userSchema')

const HapiSwagger = require('hapi-swagger')
const Vision = require('vision')
const Inert = require('inert')
const HapiJwt = require('hapi-auth-jwt2')

const UtilRoutes = require('../src/routes/utilRoutes')
const JWT_SECRET = toString(process.env.JWT_KEY)


const app = new Hapi.Server({
    port: parseInt(process.env.PORT)
})

function mapRoutes(instance, methods) {
    return methods.map(method => instance[method]())
}

async function main() {
    const connection = MongoDb.connect()
    const contextMongoDb = new Context(new MongoDb(connection, HeroSchema))

    const connectionPostgres = await Postgres.connect()
    const model = await Postgres.defineModel(connectionPostgres, userSchema)
    const contextPostgres = new Context(new Postgres(connectionPostgres, model))

    const swaggerOptions = {
        info: {
            title: 'API Heroes - #CursoNodeBR',
            version: 'v1.0'
        },
    }

    await app.register([
        HapiJwt,
        Vision,
        Inert,
        {
            plugin: HapiSwagger,
            options: swaggerOptions
        }
    ])

    app.auth.strategy('jwt', 'jwt', {
        key: JWT_SECRET,
        // options: {
        //     expiresIn: 20
        // }
        validate: async (data, request) => {
            const [result] = await contextPostgres.read({
                username: data.username.toLowerCase(),
                id: data.id
            })

            if (!result) return { isValid: false }

            return { isValid: true }
        }
    })

    app.auth.default('jwt')
    app.validator(Joi)

    app.route([
        ...mapRoutes(new HeroRoutes(contextMongoDb), HeroRoutes.methods()),
        ...mapRoutes(new AuthRoutes(JWT_SECRET, contextPostgres), AuthRoutes.methods()),
        ...mapRoutes(new UtilRoutes(), UtilRoutes.methods())
    ])

    await app.start()
    console.log("Servidor is Running in port: ", app.info.port)

    return app
}

module.exports = main()