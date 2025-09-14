# VisualizadorXML

Aplicación web que utiliza [Verovio](https://www.verovio.org/) para renderizar partituras MEI/MusicXML y `soundfont-player` para reproducirlas en formato MIDI.

## Flujo de uso
1. Carga un archivo de partitura desde el botón **Partitura**.
2. Ajusta el *offset* si la animación no coincide con el audio.
3. Opcionalmente modifica el instrumento y el volumen de cada pista en la sección **Pistas**.
4. Pulsa **Reproducir MIDI** para escuchar la partitura. El playhead seguirá la nota actual y hará autoscroll.
5. Usa **■** para detener la reproducción.

## Resolución de problemas
- **AudioContext suspendido**: algunos navegadores requieren interacción del usuario antes de reproducir audio. Asegúrate de haber hecho clic en la página.
- **Instrumentos que no cargan**: la app intenta varios servidores de *soundfonts*. Revisa la conexión a Internet o vuelve a intentarlo.
- **Playhead desalineado**: utiliza el botón *Alinear por clic* y haz clic en la nota que suena para recalibrar el offset.

## Desarrollo
Las pruebas automáticas pueden ejecutarse con:

```bash
npm test
```

Las pruebas verifican la generación de archivos MIDI y el cálculo de la posición del playhead.
