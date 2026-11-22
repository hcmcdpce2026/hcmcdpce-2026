(function () {
    'use strict';

    const api = window.PortalAPI;
    const TYPES_ENDPOINT = '/api/cms/system-category-types';
    /** Nạp danh sách loại danh mục từ máy chủ (server/lib/system-category-types.js). */
    let types = [];
    const loadTypes = async () => {
        types = await api.get(TYPES_ENDPOINT);
        if (!Array.isArray(types) || !types.length) throw new Error('Máy chủ chưa khai báo loại danh mục nào.');
        return types;
    };
    const state = { type: '', status: '', query: '', rows: [], selected: new Set(), editing: null, renderVersion: 0 };
    const el = {};

    const escape = (value) => String(value == null ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    const showError = (error) => {
        const message = document.createElement('div');
        message.className = 'cms-state cms-state--error';
        message.textContent = error.message || 'Không thể tải danh mục.';
        el.table.textContent = '';
        el.table.appendChild(message);
    };

    const setTypeOptions = (select) => {
        const options = document.createDocumentFragment();
        const all = document.createElement('option');
        all.value = '';
        all.textContent = 'Tất cả loại danh mục';
        options.appendChild(all);
        types.forEach(({ type, label }) => {
            const option = document.createElement('option');
            option.value = type;
            option.textContent = label;
            options.appendChild(option);
        });
        select.textContent = '';
        select.appendChild(options);
    };

    const filteredRows = () => {
        const query = state.query.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        return state.rows.filter((row) => {
            if (state.status && row.status !== state.status) return false;
            if (!query) return true;
            return `${row.code} ${row.name} ${row.description || ''}`.normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(query);
        });
    };

    const renderBulkBar = (visible) => {
        const count = state.selected.size;
        el.bulkBar.classList.toggle('is-visible', count > 0);
        const countEl = el.bulkBar.querySelector('[data-system-category-bulk-count]');
        if (countEl) countEl.textContent = String(count);

        const selectedCount = visible.filter((row) => state.selected.has(row.id)).length;
        el.selectAll.checked = visible.length > 0 && selectedCount === visible.length;
        el.selectAll.indeterminate = selectedCount > 0 && selectedCount < visible.length;
        el.selectAll.disabled = visible.length === 0;
        el.table.querySelectorAll('[data-system-category-select]').forEach((checkbox) => {
            checkbox.checked = state.selected.has(checkbox.value);
        });
    };

    const render = async () => {
        const version = ++state.renderVersion;
        el.table.innerHTML = '<div class="cms-state">Đang tải danh mục…</div>';
        try {
            if (!types.length) await loadTypes();
            const query = state.type ? `?type=${encodeURIComponent(state.type)}` : '';
            const rows = await api.get(`/api/cms/system-categories${query}`);
            if (version !== state.renderVersion) return;
            state.rows = Array.isArray(rows) ? rows : [];
            const rowIds = new Set(state.rows.map((row) => row.id));
            state.selected.forEach((id) => {
                if (!rowIds.has(id)) state.selected.delete(id);
            });
            const visible = filteredRows();
            const activeCount = state.rows.filter((row) => row.status === 'active').length;
            el.summary.textContent = `${visible.length} mục đang hiển thị · ${state.rows.length} tổng số (${activeCount} đang sử dụng)`;
            if (!visible.length) {
                el.table.innerHTML = '<div class="cms-state">Chưa có danh mục phù hợp. Hãy thêm mục mới hoặc điều chỉnh bộ lọc.</div>';
                renderBulkBar(visible);
                return;
            }
            el.table.innerHTML = `<div class="cms-table-wrap"><table class="cms-table cms-table--stack">
                <thead><tr><th>Mã</th><th>Tên danh mục</th><th>Mô tả</th><th>Thứ tự</th><th>Trạng thái</th><th>Ngày tạo</th><th>Người tạo</th><th>Thao tác</th></tr></thead>
                <tbody>${visible.map((row) => `<tr data-id="${escape(row.id)}">
                    <td data-label="Mã"><label class="cms-check"><input type="checkbox" data-system-category-select
                        value="${escape(row.id)}" aria-label="Chọn danh mục ${escape(row.name)}"></label>
                        <code>${escape(row.code)}</code></td>
                    <td data-label="Tên danh mục"><strong>${escape(row.name)}</strong></td>
                    <td data-label="Mô tả">${escape(row.description || '—')}</td>
                    <td data-label="Thứ tự">${Number(row.sort_order) || 0}</td>
                    <td data-label="Trạng thái"><span class="cms-badge cms-badge--${row.status === 'active' ? 'success' : 'muted'}">${row.status === 'active' ? 'Đang sử dụng' : 'Ngừng sử dụng'}</span></td>
                    <td data-label="Ngày tạo">${escape(row.created_at ? new Date(row.created_at).toLocaleDateString('vi-VN') : '—')}</td>
                    <td data-label="Người tạo">${escape(row.created_by || '—')}</td>
                    <td data-label="Thao tác"><div class="cms-u-flex cms-u-gap-sm">
                        <button type="button" class="cms-btn cms-btn--sm" data-edit="${escape(row.id)}">Sửa</button>
                        <button type="button" class="cms-btn cms-btn--sm" data-status="${escape(row.id)}" data-next-status="${row.status === 'active' ? 'inactive' : 'active'}">${row.status === 'active' ? 'Ngừng dùng' : 'Kích hoạt'}</button>
                        <button type="button" class="cms-btn cms-btn--sm cms-btn--danger" data-delete="${escape(row.id)}">Xóa</button>
                    </div></td>
                </tr>`).join('')}</tbody></table></div>`;
            renderBulkBar(visible);
        } catch (error) {
            showError(error);
            renderBulkBar([]);
        }
    };

    const clearSelection = () => {
        state.selected.clear();
        renderBulkBar(filteredRows());
    };

    const deleteSelected = () => {
        const targets = filteredRows().filter((row) => state.selected.has(row.id));
        if (!targets.length) return;
        if (!window.confirm(`Xóa ${targets.length} danh mục đã chọn? Danh mục đang được dữ liệu khác sử dụng sẽ không thể xóa.`)) return;

        (async () => {
            let deleted = 0;
            const failures = [];
            for (const row of targets) {
                try {
                    await api.del(`/api/cms/system-categories/${encodeURIComponent(row.id)}`);
                    state.selected.delete(row.id);
                    deleted += 1;
                } catch (error) {
                    failures.push({ name: row.name, message: error.message || 'Không thể xóa danh mục.' });
                }
            }
            await render();
            if (failures.length) {
                window.alert(`Đã xóa ${deleted}/${targets.length} danh mục. ${failures.length} danh mục được giữ lại.\n${failures[0].name}: ${failures[0].message}`);
            } else {
                window.alert(`Đã xóa ${deleted} danh mục.`);
            }
        })();
    };

    const openForm = (row) => {
        state.editing = row || null;
        el.dialogTitle.textContent = row ? 'Chỉnh sửa danh mục' : 'Thêm danh mục';
        setTypeOptions(el.formType);
        el.formType.value = row ? row.category_type : state.type;
        el.formType.disabled = !!row;
        el.formCode.value = row ? row.code : '';
        el.formName.value = row ? row.name : '';
        el.formDescription.value = row ? row.description || '' : '';
        el.formStatus.value = row ? row.status : 'active';
        el.dialog.showModal();
        el.formName.focus();
    };

    const bind = () => {
        setTypeOptions(el.type);
        el.type.value = state.type;
        el.type.addEventListener('change', () => { state.type = el.type.value; clearSelection(); render(); });
        el.status.addEventListener('change', () => { state.status = el.status.value; clearSelection(); render(); });
        el.search.addEventListener('input', () => { state.query = el.search.value; clearSelection(); render(); });
        el.create.addEventListener('click', () => openForm(null));
        el.close.addEventListener('click', () => el.dialog.close());
        el.cancel.addEventListener('click', () => el.dialog.close());

        el.form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const payload = {
                categoryType: el.formType.value,
                code: el.formCode.value.trim(),
                name: el.formName.value.trim(),
                description: el.formDescription.value.trim(),
                status: el.formStatus.value,
            };
            if (!payload.name) return el.formName.focus();
            try {
                if (state.editing) await api.put(`/api/cms/system-categories/${encodeURIComponent(state.editing.id)}`, payload);
                else await api.post('/api/cms/system-categories', payload);
                el.dialog.close();
                await render();
            } catch (error) {
                window.alert(error.message || 'Không thể lưu danh mục.');
            }
        });

        el.table.addEventListener('click', async (event) => {
            const button = event.target.closest('button');
            if (!button) return;
            const row = state.rows.find((item) => item.id === button.dataset.edit
                || item.id === button.dataset.status || item.id === button.dataset.delete);
            if (!row) return;
            if (button.dataset.edit) return openForm(row);
            if (button.dataset.status) {
                try {
                    await api.request('PATCH', `/api/cms/system-categories/${encodeURIComponent(row.id)}/status`, {
                        status: button.dataset.nextStatus,
                    });
                    await render();
                } catch (error) {
                    window.alert(error.message || 'Không thể đổi trạng thái danh mục.');
                }
                return;
            }
            if (button.dataset.delete && window.confirm(`Xóa danh mục “${row.name}”? Danh mục đang được sử dụng sẽ không thể xóa.`)) {
                try {
                    await api.del(`/api/cms/system-categories/${encodeURIComponent(row.id)}`);
                    state.selected.delete(row.id);
                    await render();
                } catch (error) {
                    window.alert(error.message || 'Không thể xóa danh mục.');
                }
            }
        });

        el.selectAll.addEventListener('change', () => {
            filteredRows().forEach((row) => {
                if (el.selectAll.checked) state.selected.add(row.id);
                else state.selected.delete(row.id);
            });
            renderBulkBar(filteredRows());
        });
        el.table.addEventListener('change', (event) => {
            const checkbox = event.target.closest('[data-system-category-select]');
            if (!checkbox) return;
            if (checkbox.checked) state.selected.add(checkbox.value);
            else state.selected.delete(checkbox.value);
            renderBulkBar(filteredRows());
        });
        el.bulkBar.addEventListener('click', (event) => {
            const button = event.target.closest('[data-system-category-bulk-action]');
            if (!button) return;
            if (button.dataset.systemCategoryBulkAction === 'delete') deleteSelected();
            else if (button.dataset.systemCategoryBulkAction === 'clear') clearSelection();
        });
    };

    const init = async () => {
        if (!api || !document.getElementById('system-category-table')) return;
        el.type = document.getElementById('system-category-type');
        el.status = document.getElementById('system-category-status');
        el.search = document.getElementById('system-category-search');
        el.summary = document.getElementById('system-category-summary');
        el.table = document.getElementById('system-category-table');
        el.selectAll = document.getElementById('system-category-select-all');
        el.bulkBar = document.getElementById('system-category-bulkbar');
        el.create = document.getElementById('system-category-create');
        el.dialog = document.getElementById('system-category-dialog');
        el.dialogTitle = document.getElementById('system-category-dialog-title');
        el.form = document.getElementById('system-category-form');
        el.formType = document.getElementById('system-category-form-type');
        el.formCode = document.getElementById('system-category-form-code');
        el.formName = document.getElementById('system-category-form-name');
        el.formDescription = document.getElementById('system-category-form-description');
        el.formStatus = document.getElementById('system-category-form-status');
        el.close = document.getElementById('system-category-close');
        el.cancel = document.getElementById('system-category-cancel');
        try {
            await loadTypes();
        } catch (error) {
            showError(error);
            return;
        }
        bind();
        render();
    };

    document.addEventListener('DOMContentLoaded', init);
})();
