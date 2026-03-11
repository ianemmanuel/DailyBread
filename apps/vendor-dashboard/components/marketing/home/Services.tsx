'use client'
import { services } from '@/lib/data/marketing/services'
import Image from "next/image"
import { motion } from "framer-motion"
import { FadeLeft } from '@/utils/animations/animation'

const Services = () => {
  return (
    <section>
        <div className="section-wrapper container pt-12 pb-20">
            <motion.h1 
                initial={{ opacity: 0, x: -200 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ duration: 1, delay: 0.3 }}
                className="text-2xl font-bold text-left pb-10 uppercase"
            >
                Our Services
            </motion.h1>
            <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8'>
                {services.map((service)=> (
                    <motion.div 
                        variants={FadeLeft(service.delay)}
                        initial="hidden"
                        whileInView={"visible"}
                        whileHover={{ scale: 1.1 }}
                        key={service.id} 
                        className='bg-white rounded-3xl px-4 py-2 shadow-[[0_0_22px_0_rgba(0,0,0,0.15)]] flex flex-row justify-around items-center gap-3'>
                        <Image
                            src={ service.link }
                            alt=""
                            width={80}
                            height={80}  
                            className='w-15 mb-4 scale-110 transform -translate-y-6'
                        />
                        <div>
                            <h1 className="text-lg font-semibold">{service.title}</h1>
                        </div>
                    </motion.div>
                ))}
            </div>
        </div>
    </section>
  )
}

export default Services