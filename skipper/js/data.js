const state = {
  // пользователи
  users: [
    { id: 1, name: "Марина Ковалева", email: "marina@skipper.ru", password: "123", isExpert: true },
    { id: 2, name: "Дмитрий Соколов", email: "dmitry@skipper.ru", password: "123", isExpert: true },
    { id: 3, name: "Анна Литвинова", email: "anna@skipper.ru", password: "123", isExpert: true },
    { id: 4, name: "Игорь Ветров", email: "igor@skipper.ru", password: "123", isExpert: true },
    { id: 5, name: "Ольга Мещерякова", email: "olga@skipper.ru", password: "123", isExpert: true },
    { id: 6, name: "Павел Черных", email: "pavel@skipper.ru", password: "123", isExpert: true },
    { id: 7, name: "Тестовый Пользователь", email: "user@skipper.ru", password: "123", isExpert: false },
  ],

  // профиля экспертов
  experts: [
    {
      id: 1, userId: 1,
      name: "Марина Ковалева",
      headline: "Карьерный консультант, ex-HR директор",
      about: "12 лет в управлении персоналом в IT и ритейле. Помогаю разобраться, куда двигаться в карьере, и готовлю к собеседованиям на позиции от джуна до руководителя.",
      contacts: { telegram: "@m_kovaleva", email: "marina@skipper.ru" },
      specialties: [
        {
          title: "Выбор профессии и карьерный трек",
          topics: ["Карьера", "Выбор профессии"],
          experience: "Провела более 400 карьерных консультаций, автор курса по самоопределению для студентов.",
          formats: [
            { name: "Видеозвонок 60 минут", price: 2500 },
            { name: "Разбор резюме письменно", price: 1200 },
          ],
        },
        {
          title: "Подбор персонала для малого бизнеса",
          topics: ["Подбор персонала", "HR"],
          experience: "Строила отделы найма с нуля в трех компаниях, закрывала позиции от продавца до CTO.",
          formats: [
            { name: "Стратегическая сессия 90 минут", price: 4000 },
          ],
        },
      ],
    },
    {
      id: 2, userId: 2,
      name: "Дмитрий Соколов",
      headline: "Тимлид разработки, Python/Go",
      about: "Веду команды разработки 8 лет. Разбираю проблемы на проектах: от горящих сроков и техдолга до конфликтов в команде.",
      contacts: { telegram: "@d_sokolov_dev", email: "dmitry@skipper.ru" },
      specialties: [
        {
          title: "Разбор проблем на IT-проекте",
          topics: ["IT и разработка", "Разбор кейса"],
          experience: "Вывел из кризиса 5 проектов, менторил 30+ разработчиков, спикер митапов по управлению командами.",
          formats: [
            { name: "Видеозвонок 60 минут", price: 3000 },
            { name: "Код-ревью с разбором", price: 2000 },
            { name: "Переписка, ответ в течение дня", price: 900 },
          ],
        },
      ],
    },
    {
      id: 3, userId: 3,
      name: "Анна Литвинова",
      headline: "Маркетолог, запуск продуктов",
      about: "Запускала маркетинг в стартапах и у крупных брендов. Консультирую по стратегии продвижения, контенту и первым продажам.",
      contacts: { telegram: "@a_litvinova", email: "anna@skipper.ru" },
      specialties: [
        {
          title: "Маркетинговая стратегия для малого бизнеса",
          topics: ["Маркетинг", "Бизнес"],
          experience: "10 лет в маркетинге, 20+ запусков продуктов, преподаю в школе digital-профессий.",
          formats: [
            { name: "Видеозвонок 60 минут", price: 2800 },
            { name: "Аудит соцсетей письменно", price: 1500 },
          ],
        },
      ],
    },
    {
      id: 4, userId: 4,
      name: "Игорь Ветров",
      headline: "Предприниматель, e-commerce",
      about: "Построил два бизнеса на маркетплейсах. Помогаю начинающим предпринимателям: выбор ниши, юнит-экономика, первые поставки.",
      contacts: { telegram: "@vetrov_biz", email: "igor@skipper.ru" },
      specialties: [
        {
          title: "Запуск бизнеса на маркетплейсах",
          topics: ["Бизнес", "Разбор кейса"],
          experience: "Оборот магазинов - 40+ млн рублей в год, 6 лет в e-commerce, менторил 15 запусков.",
          formats: [
            { name: "Видеозвонок 90 минут", price: 5000 },
            { name: "Экспресс-созвон 30 минут", price: 1800 },
          ],
        },
      ],
    },
    {
      id: 5, userId: 5,
      name: "Ольга Мещерякова",
      headline: "Психолог, работа со стрессом",
      about: "Практикующий психолог, 9 лет опыта. Помогаю справляться со стрессом на учебе и работе, выгоранием и прокрастинацией.",
      contacts: { telegram: "@o_mesch", email: "olga@skipper.ru" },
      specialties: [
        {
          title: "Стресс, выгорание, прокрастинация",
          topics: ["Психология"],
          experience: "Более 2000 часов консультаций, работаю в когнитивно-поведенческом подходе.",
          formats: [
            { name: "Видеозвонок 50 минут", price: 3500 },
          ],
        },
      ],
    },
    {
      id: 6, userId: 6,
      name: "Павел Черных",
      headline: "Финансовый советник",
      about: "Помогаю навести порядок в личных финансах: бюджет, подушка безопасности, первые инвестиции без лишнего риска.",
      contacts: { telegram: "@p_chernykh", email: "pavel@skipper.ru" },
      specialties: [
        {
          title: "Личные финансы и первые инвестиции",
          topics: ["Финансы"],
          experience: "8 лет в банковской сфере, независимый советник с 2021 года, 300+ клиентов.",
          formats: [
            { name: "Видеозвонок 60 минут", price: 2600 },
            { name: "Финансовый план письменно", price: 3200 },
          ],
        },
      ],
    },
  ],

  // заявкии экспертам, текущй пользователь и id для новых пользователей
  requests: [],
  currentUser: null,   
  nextId: 100,         
};

const TOPICS = ["Карьера","Выбор профессии","Подбор персонала","HR","IT и разработка","Разбор кейса","Маркетинг","Бизнес","Психология","Финансы"];

let route = { view: "catalog", param: null };  
let filter = { q: "", topic: null };           
let cabinetTab = "profile";                    
let authMode = "login";                        
let modalState = null;                         