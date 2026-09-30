-- These sources remain registered for future adapters, but must not run silently.
update collector_sources
set enabled = false,
    tier = case when name = 'JC Concursos' then 2 else tier end,
    last_status = 'DISABLED_NO_ADAPTER',
    last_error_code = 'ADAPTER_NOT_IMPLEMENTED'
where name in ('FCC', 'Cesgranrio', 'JC Concursos');
