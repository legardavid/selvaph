# Asamblea Reserva Serrat Selva

## Inicio local

Las credenciales locales se cargan desde `.env`. Ese archivo contiene secretos y está excluido de Git. Inicie el servidor con:

```sh
npm start
```

Abra `/registro` para la mesa, `/admin` para administración, `/en-vivo` para el proyector y `/` para votar. El navegador solicitará las credenciales al entrar a la mesa o al panel administrativo.

Para configurar un despliegue, copie las variables de `.env.example` al gestor de variables del proveedor. En Vercel, agregue `ADMIN_USER`, `ADMIN_PASSWORD`, `REGISTRO_USER`, `REGISTRO_PASSWORD`, `TOKEN_SECRET` y `PUBLIC_URL` en los entornos correspondientes y vuelva a desplegar.

## Base de datos

El quórum en vivo suma los coeficientes de las unidades que tienen `registrado = 1`. La vista consulta `/api/quorum-global` cada 2.5 segundos. En ejecución local, el archivo SQLite se comparte entre todas las páginas del servidor.

El archivo SQLite incluido en una función de Vercel no es almacenamiento persistente ni compartido entre invocaciones. Para que los registros y votos sobrevivan y se reflejen de forma consistente en producción, hay que conectar una base de datos administrada y persistente; definir `DATABASE_PATH` no convierte el disco temporal de Vercel en almacenamiento durable.
