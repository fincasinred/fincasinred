# FINCASINRED — 6.7 DESPLIEGUE

## Qué falta hacer manualmente

1. Crear un repositorio en GitHub llamado `fincasinred`.
2. Subir el contenido de esta carpeta al repositorio.
3. En Render: New -> Web Service -> conectar el repositorio.
4. Elegir Docker.
5. Desplegar.
6. Abrir la URL `https://NOMBRE.onrender.com`.
7. Comprobar `/health`.

Render documenta que un Web Service recibe una URL `onrender.com` y puede
desplegarse desde un repositorio conectado. También soporta Dockerfile.

## Después

Cuando la web esté funcionando:
- conectar PostgreSQL;
- activar el motor completo 6.6;
- ejecutar pruebas reales PVGIS;
- conectar el dominio.

## Dominio

En Render:
Settings -> Custom Domains -> Add Custom Domain.

Después se configuran los registros DNS en el proveedor donde se haya comprado
el dominio y se verifica en Render. Render crea y renueva el certificado TLS
automáticamente.

Fuentes oficiales:
https://render.com/docs/deploy-fastapi
https://render.com/docs/docker
https://render.com/docs/custom-domains
https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-new-repository

## Importante

No pongas todavía datos de clientes reales. Esta fase es de despliegue y prueba.
