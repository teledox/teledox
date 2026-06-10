const { query } = require('../src/services/supabase');
const { crearSeguimientoLab, enviarRecordatorioLab } = require('../src/services/seguimientoLaboratorio');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const { consulta_id, paciente_id } = req.body || {};
  if (!consulta_id || !paciente_id) return res.status(400).json({ error: 'Faltan consulta_id o paciente_id' });

  try {
    const pacientes = await query('GET', 'pacientes', null, `?id=eq.${paciente_id}&select=nombre,apellidos,telefono`);
    const paciente = pacientes?.[0];
    if (!paciente?.telefono) return res.status(400).json({ error: 'El paciente no tiene teléfono registrado' });

    let seguimiento = await crearSeguimientoLab(consulta_id, paciente_id);
    if (!seguimiento.activo) {
      const reactivados = await query('PATCH', 'seguimiento_laboratorio',
        { activo: true, estado: 'pendiente', intento: 0 }, `?id=eq.${seguimiento.id}`);
      seguimiento = Array.isArray(reactivados) ? reactivados[0] : { ...seguimiento, activo: true, estado: 'pendiente', intento: 0 };
    }

    const { intento } = await enviarRecordatorioLab(seguimiento, paciente);
    return res.status(200).json({ ok: true, intento });
  } catch (err) {
    console.error('[enviar-seguimiento-lab]', err.message);
    return res.status(500).json({ error: err.message });
  }
};
